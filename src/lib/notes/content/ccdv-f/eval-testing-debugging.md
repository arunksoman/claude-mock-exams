## Systematic evaluation of outputs

> **Exam tip:** This domain is only ~2.6% of the exam (1-2 questions) but tests a distinct mindset: *"it seems to work when I tried it a few times"* is not evidence. The exam wants you to recognize what a rigorous, repeatable evaluation process looks like.

- **Why "it seems to work" isn't enough:**
  - A handful of manual tries only samples the *easy*, obvious inputs you thought of — it says nothing about edge cases, adversarial inputs, or the long tail of real user behavior.
  - Without a fixed, repeatable test set, you can't tell whether a prompt change, model upgrade, or temperature tweak made things *better* or *worse* — you're comparing vibes, not numbers.
  - Manual spot-checking doesn't scale and doesn't catch **regressions** — a change that fixes one case can silently break three others.

### Building an {{eval set|A curated collection of representative test cases (inputs + expected/graded outputs) used to measure model or pipeline performance consistently over time}}

- **Mirror the real task distribution.** Pull examples from actual production traffic, support tickets, or realistic simulated inputs — not just cases you find interesting to write.
- **Deliberately include edge cases:**
  - Empty, malformed, or missing input data
  - Overly long inputs (near context-window limits)
  - Ambiguous cases where even human graders would disagree
  - Adversarial or harmful input
- **Prioritize volume over hand-crafted perfection.** Many automatically-graded test cases beat a small number of beautifully hand-graded ones — volume gives you statistical confidence and catches rarer failure modes.
- **Use a held-out set.** Don't reuse the same examples you used to iterate on the prompt — that's optimizing for the test, not the task (overfitting to your own eval set).
- Define **success criteria** up front, and make them *specific* and *measurable*:

| Vague (bad) | Specific (good) |
|---|---|
| "Safe outputs" | "Fewer than 0.1% of outputs flagged for toxicity, out of 10,000 trials" |
| "Good summaries" | "ROUGE-L F1 ≥ 0.4 against reference summaries" |
| "Fast enough" | "95th percentile latency < 2s" |

- Common dimensions worth scoring separately: **task fidelity**, consistency, relevance/coherence, tone/style, privacy preservation, context utilization, latency, and cost. Most real applications need a *multidimensional* rubric, not a single pass/fail number.

### Grading approaches

> **Exam tip:** Expect a question asking you to pick the *right grader* for a given output type (e.g., "classification label" → exact match; "empathetic tone" → LLM judge).

| Approach | Best for | Pros | Cons |
|---|---|---|---|
| **Code-based / exact-match** | Categorical or structured outputs (labels, JSON fields, numbers) | Cheap, deterministic, instant, no grader bias | Can't judge nuance, tone, or open-ended quality |
| **{{LLM-as-judge|Using a separate LLM call to score or grade another model's output against a rubric}}** | Subjective qualities: tone, helpfulness, safety, faithfulness | Scales to open-ended output, can apply nuanced rubrics | Costs tokens/latency, can be inconsistent, needs its own validation |
| **Human review** | High-stakes, ambiguous, or novel cases; validating the other two | Gold-standard judgment, catches what automated graders miss | Slow, expensive, doesn't scale, still subject to inter-rater disagreement |

- **Code-based / exact-match graders** — simplest and cheapest; compare model output to a known-correct answer.

```python
def evaluate_exact_match(model_output, correct_answer):
    return model_output.strip().lower() == correct_answer.strip().lower()

accuracy = sum(
    evaluate_exact_match(get_completion(tweet), tweet["sentiment"])
    for tweet in test_tweets
) / len(test_tweets)
```

- A single exact-match boolean is a **pass/fail cliff** — it can't tell you "close but missing one field" from "completely wrong." For structured outputs, score each criterion separately instead:

```python
import json

def evaluate_rubric(model_output: str, expected: dict) -> dict:
    """Rubric-based grader for a structured JSON extraction task.
    Scores each criterion independently instead of a single pass/fail,
    so a near-miss doesn't look identical to a total failure."""
    results = {"parses_as_json": False, "has_all_fields": False,
               "values_match": False, "no_extra_fields": False}
    try:
        parsed = json.loads(model_output)
    except (json.JSONDecodeError, TypeError):
        return results  # can't score further criteria if it doesn't even parse

    results["parses_as_json"] = True
    results["has_all_fields"] = set(expected.keys()) <= set(parsed.keys())
    results["values_match"] = all(parsed.get(k) == v for k, v in expected.items())
    results["no_extra_fields"] = set(parsed.keys()) <= set(expected.keys())
    results["score"] = sum(v for v in results.values() if isinstance(v, bool)) / 4
    return results
```

> **In practice:** Store the *per-criterion* breakdown, not just the aggregate `score` — when a regression appears, "`has_all_fields` dropped from 98% to 80%" tells you exactly what broke, while a single blended number just tells you *something* did.

- Other code-based techniques: **cosine similarity** on embeddings (semantic consistency across paraphrases), **ROUGE-L** (summarization/content overlap).
- **LLM-as-judge graders** — ask a separate model call to score the output against a rubric. Typical patterns: binary (yes/no — e.g. "does this contain PHI?"), Likert scale (1-5 — e.g. tone/empathy), or ordinal (context utilization). A real judge prompt should give the rubric explicitly, and ask for reasoning *before* the score:

```text
You are grading a customer-support reply for empathy and correctness.

<task>
Customer message: {customer_message}
Agent reply: {model_output}
</task>

<rubric>
1 (poor): dismissive, inaccurate, or ignores the customer's issue
3 (adequate): factually correct but flat/impersonal tone
5 (excellent): accurate, warm, and directly addresses the concern
</rubric>

First, in <reasoning> tags, note in one or two sentences what the reply gets
right or wrong against the rubric above.
Then output your final judgment in <score> tags as a single integer 1-5.
```

```python
import re

def evaluate_with_reasoning(client, customer_message, model_output, target_tone="empathetic"):
    prompt = f"""You are grading a customer-support reply for {target_tone}ness and correctness.

<task>
Customer message: {customer_message}
Agent reply: {model_output}
</task>

<rubric>
1 (poor): dismissive, inaccurate, or ignores the customer's issue
3 (adequate): factually correct but flat/impersonal tone
5 (excellent): accurate, warm, and directly addresses the concern
</rubric>

First, in <reasoning> tags, note in one or two sentences what the reply gets
right or wrong against the rubric above.
Then output your final judgment in <score> tags as a single integer 1-5."""

    response = client.messages.create(
        model="claude-opus-5", max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    reasoning = re.search(r"<reasoning>(.*?)</reasoning>", text, re.S)
    score = re.search(r"<score>\s*(\d)\s*</score>", text)
    return {
        "score": int(score.group(1)) if score else None,
        "reasoning": reasoning.group(1).strip() if reasoning else None,
    }
```

> **In practice:** Judge calls add real cost and latency at eval-set scale (hundreds or thousands of graded examples per run) — a cheaper, faster model (e.g. **Claude Haiku**) is often good enough as a judge even when a stronger model generated the output being graded. Cache the rubric/instructions portion of the judge prompt with **prompt caching** if you're grading many outputs against the same rubric in a run.

> **Gotcha:** Prefer using a **different model** for grading than the one that generated the output — grading with the same model instance risks self-serving bias (a model rating its own work favorably). Encouraging the judge model to reason/think before outputting a score, as above, also measurably improves grading accuracy on complex judgments.

- **Human review** — the gold standard, but slow and expensive. Reserve it for: validating that your automated graders actually agree with human judgment, spot-checking a sample of automated grades, and genuinely ambiguous or high-stakes cases (legal, medical, safety-critical).

> **Exam tip:** A common exam pattern is "which grading method is cheapest and most reliable for X" — categorical/structured output → code-based; open-ended subjective quality → LLM-as-judge; final sign-off on high-stakes edge cases → human review. In practice, real pipelines usually combine all three.

### Tracking eval results over prompt/model changes

- Treat your eval set as a **regression suite**: rerun it every time you change the prompt, switch models, adjust temperature, or update tool definitions.
- Version your prompts and record the eval score alongside each version so you can trace *which change* caused a quality shift.
- Compare **side-by-side**, not just before/after in isolation — run the old and new prompt against the identical test set in the same pass so nothing else (like time-of-day API variance) confounds the comparison.
- Track scores broken down **per dimension** (accuracy, tone, latency, cost) rather than one aggregate number — a prompt tweak might raise accuracy while quietly hurting latency or tone.

> **Note:** The Anthropic Console ships a built-in **Evaluation tool** (the "Evaluate" tab) for exactly this: it runs a prompt against a set of test cases, grades on a scale, and supports side-by-side comparison as you iterate on prompt versions.

---

## Debugging techniques

- **Reproduce with a minimal prompt.** Before debugging a complex agent or multi-turn pipeline, strip the problem down to the smallest single request that still reproduces the bad output. This isolates whether the issue is in your surrounding harness or in the model's response to a specific input.
  - Remove tools, system prompt additions, and conversation history one at a time until the bug disappears — the last thing you removed is a strong suspect.
- **Inspect the full request and response, not just the final text.** Bugs often hide in parts of the payload your UI doesn't surface:
  - The exact `system` prompt and `messages` array as actually sent (not what you *think* you sent — log the serialized JSON)
  - Every **tool-use turn**: the `tool_use` block Claude emitted (name + input), and the `tool_result` you sent back, including `is_error`
  - `stop_reason` and `stop_details` on the response
  - `thinking` blocks, if extended/adaptive thinking is enabled

```python
response = client.messages.create(model="claude-opus-5", max_tokens=4096,
                                   messages=messages, tools=tools)
print("stop_reason:", response.stop_reason)
print("usage:", response.usage)
for block in response.content:
    print(block.type, "->", block)
```

- **`usage` fields worth checking beyond just token counts:** `usage.input_tokens` / `usage.output_tokens` are the raw counts; if you use prompt caching, `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens` tell you whether the cache actually hit. A `cache_read_input_tokens` of `0` when you expected a hit is a strong signal your cached prefix changed — even a single-token edit earlier in the prompt invalidates the whole cached block.
- **Check token usage and truncation.** A truncated response can look like a "wrong" or "incomplete" answer when it's actually just cut off. The full set of `stop_reason` values:

| `stop_reason` | Meaning |
|---|---|
| `end_turn` | Claude finished naturally — the normal, healthy case |
| `max_tokens` | Hit your requested `max_tokens` cap — response is likely truncated |
| `stop_sequence` | Claude emitted one of your custom `stop_sequences` — check the `stop_sequence` field for which one |
| `tool_use` | Claude is calling a tool — run it and send back a `tool_result` |
| `pause_turn` | A long-running server-tool loop hit its turn limit — send the content back to let it continue |
| `refusal` | The model (or a safety classifier) declined — inspect `stop_details` before assuming a generic failure |
| `model_context_window_exceeded` | Response filled the model's *context window*, not just your token cap — valid but limited; compact or shorten the conversation |

  > **Gotcha:** Stop reasons like `max_tokens` and `refusal` are **not HTTP errors** — you get a normal `200 OK`. If your code only checks for exceptions, a silently truncated or refused response will sail through unnoticed. Always inspect `stop_reason` explicitly.

- **React to truncation, not just detect it.** Detecting `max_tokens` is only half the job — a real pipeline should retry with more headroom (capped, so a genuinely oversized task doesn't retry forever):

```python
def get_completion_with_headroom(client, messages, tools=None, max_tokens=1024, retries=2):
    """Reacts to truncation instead of silently returning a cut-off response."""
    for attempt in range(retries + 1):
        response = client.messages.create(
            model="claude-opus-5", max_tokens=max_tokens,
            messages=messages, tools=tools or [],
        )
        if response.stop_reason != "max_tokens":
            return response
        if attempt == retries:
            raise RuntimeError(
                f"Still truncated after {retries} retries at max_tokens={max_tokens}"
            )
        max_tokens *= 2  # give it more room and try again
    return response
```

  > **In practice:** Doubling `max_tokens` blindly can quietly balloon cost on a request that's truncating for a structural reason (e.g. Claude stuck in a repetitive loop) rather than a genuinely too-small cap — always cap the retry count, and log when this path fires so a real pattern shows up in your metrics instead of hiding inside a "successful" retried call.

- **Compare across model versions.** When behavior looks wrong, run the *identical* request against a different model (or model version) to see whether the issue is model-specific (a capability gap, a known behavioral quirk) or present everywhere (more likely your prompt/schema).
- **Use `temperature=0` (or low `effort`) for determinism when debugging.** Sampling randomness makes a bug look intermittent when it's really deterministic-but-rare, or vice versa.

  > **Note:** `temperature=0` narrows variance but does **not guarantee byte-identical output** across repeated calls — treat it as "more reproducible for diagnosis," not a perfect determinism switch. On newer model families sampling parameters like `temperature` may not even be configurable — control variance via `effort` and prompt specificity instead.

- **Streaming-specific debugging:** if you stream responses, `stop_reason` only appears on the `message_delta` event, not `message_start` — code that reads it too early will always see it as unset/`None`.

```mermaid
flowchart TD
    A[Bad output reported] --> B{Reproducible with\na minimal prompt?}
    B -- No, only in full app --> C[Bug is likely in YOUR\nharness/integration code]
    B -- Yes, minimal request\nalso fails --> D{Is stop_reason\nend_turn / tool_use?}
    D -- No: max_tokens,\nrefusal, context_exceeded --> E[Not a model 'bug' -\nhandle the stop_reason]
    D -- Yes --> F{Does the SAME prompt\nfail on another model\nor at temp=0?}
    F -- Fails everywhere --> G[Likely a genuine\nmodel/prompt limitation]
    F -- Only fails on one\nmodel/config --> H[Model- or config-specific\nbehavior - adjust prompt\nor pin model version]
```

---

## Isolating failures between integration layers & recovery strategies

> **Exam tip:** Expect a scenario question like "the output looks wrong — where do you look first?" The correct instinct is **layer-by-layer isolation**, working from your code outward to the model, rather than guessing.

### Is the bug in YOUR code or in the MODEL's output?

- **Client-side code bugs** (the most common culprit in practice):
  - A malformed **tool schema** — a missing `required` field, wrong `type`, or an ambiguous `description` that makes Claude pick the wrong tool or invent parameters
  - A bug in how you **parse the response** — e.g., assuming `content[0]` is always text when it might be a `tool_use` or `thinking` block first
  - Dropping or reordering `tool_result` blocks, or not returning one `tool_result` per `tool_use` id
  - Silently mutating `thinking` blocks before replaying them back (this triggers a hard 400 error on some models — an easy one to instrument for)
  - Stale conversation history, wrong system prompt version, or a caching bug serving an old prompt
- **Model output issues:**
  - The model genuinely misunderstood ambiguous instructions
  - A capability gap for the specific task (reasoning failure, hallucinated fact)
  - A safety-related refusal that's a legitimate model decision, not a bug

### Systematic layer-by-layer isolation

Work outward from the layer you control most directly to the layer you control least:

```mermaid
flowchart LR
    A[Your client code] --> B[API request\nbuilt & sent]
    B --> C[Model generates\na response]
    C --> D[API response\nreceived]
    D --> E[Your parsing /\nhandling code]
    A -.bug here: malformed\nrequest, bad schema.-> A
    E -.bug here: wrong\nparsing assumption.-> E
    C -.bug here: genuine\nmodel limitation.-> C
```

- **Step 1 — log the exact request.** Confirm what was actually sent matches what you intended (tool schemas, system prompt, message history).
- **Step 2 — log the exact response.** Confirm `stop_reason`, content blocks, and any tool calls are what you expect *before* your parsing code touches them.
- **Step 3 — bisect.** If step 1 and step 2 both look correct but downstream behavior is still wrong, the bug is in your handling/parsing code between "response received" and "action taken." If the *response itself* looks wrong given a correct request, the issue is upstream in the model/prompt.
- **Step 4 — swap one variable at a time.** Change only the model, only the temperature/effort, or only the prompt — never several at once — so a single test isolates a single cause.

> **Exam tip:** A malformed tool schema and a parsing bug in your own code are, from the *outside*, indistinguishable from "the model is misbehaving." The exam rewards recognizing that these integration-layer bugs are often the actual root cause, not the model.

### Graceful recovery strategies

- **Retries** — for transient, retryable failures (rate limits `429`, server errors `5xx`, network errors): retry with exponential backoff. Don't retry non-retryable errors (`400`, `401`, `404`) — retrying a malformed request just repeats the same failure.
- **Fallback prompts / fallback models** — if a request is refused or fails validation, retry with a simplified prompt, a stricter output format, or a different model tier rather than looping on the same failing request. A minimal sketch — try the primary model, and only on failure fall back to a different model *and* a simplified prompt, rather than retrying the identical request:

```python
def generate_with_fallback(client, messages, primary_model, fallback_model):
    """Try the primary model; on refusal/failure, retry once with a
    fallback model and a stricter, simplified prompt — not the same
    request again."""
    try:
        response = client.messages.create(
            model=primary_model, max_tokens=1024, messages=messages,
        )
        if response.stop_reason == "refusal":
            raise ValueError(f"refused: {response.stop_reason}")
        return response
    except Exception as primary_error:
        simplified = messages + [{
            "role": "user",
            "content": "Please answer directly and concisely, avoiding any disallowed content.",
        }]
        try:
            return client.messages.create(
                model=fallback_model, max_tokens=1024, messages=simplified,
            )
        except Exception as fallback_error:
            raise RuntimeError(
                f"Both models failed: primary={primary_error!r}, fallback={fallback_error!r}"
            ) from fallback_error
```

> **In practice:** Be careful what you retry. Retrying the *generation* step is safe, but if the assistant turn already triggered a **tool call with a real side effect** (sent an email, charged a card, wrote a database row) before the failure, blindly re-running the whole loop can repeat that side effect. Either make the tool idempotent (an idempotency key, a dedupe check) or only retry the parts of the pipeline that are provably side-effect-free.

- **Surface a clear error instead of silently failing** — never swallow a bad `stop_reason` or a parse failure and return an empty/default result to the user without logging it. A loud, specific failure is far easier to debug later than a quiet wrong answer.
- **Validate before you trust.** For tool inputs, JSON outputs, or structured data, parse and validate the model's output before acting on it (e.g., `json.loads()` rather than raw string matching) — this converts silent misbehavior into a catchable exception.

| Recovery strategy | Use when |
|---|---|
| Retry with backoff | Transient error: rate limit, `5xx`, network timeout |
| Fallback model / simplified prompt | Refusal, repeated malformed output, capability gap |
| Surface explicit error to caller/user | Non-retryable failure, or retries exhausted |
| Log + alert, don't auto-retry silently forever | Any failure mode you haven't diagnosed yet |

> **Gotcha:** An agentic loop that catches every exception and just "tries again" without inspecting *why* it failed can spin indefinitely, burning tokens on a request that will never succeed (e.g., retrying a `400` invalid-schema error forever). Always branch retry logic on the specific error/stop-reason type.

### Further reading

- [Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) — success criteria framework and code-based / LLM-graded / human grading methods
- [Using the Evaluation Tool](https://platform.claude.com/docs/en/test-and-evaluate/eval-tool) — Anthropic Console's built-in eval tool for side-by-side prompt comparison
- [Troubleshooting tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/troubleshooting-tool-use) — symptom-to-fix diagnostic tables for common tool-use errors
- [Handling stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons) — full list of `stop_reason` values and how to detect/handle truncation
- [API errors reference](https://platform.claude.com/docs/en/api/errors) — HTTP error codes and error-type reference for recovery/retry logic
