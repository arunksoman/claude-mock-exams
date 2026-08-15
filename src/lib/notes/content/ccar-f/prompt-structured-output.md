## Scope of this domain

System prompt design, few-shot prompting, structured/guaranteed output
mechanisms, validation of extracted or generated data, and the Batch API's
cost/latency tradeoff. Tied with Claude Code Configuration as the
second-largest domain at 20%.

> **Exam tip:** this domain has the highest density of "which mechanism
> guarantees this?" questions on the exam. When a question asks how to
> _guarantee_ a property (valid JSON, a tool being called, format
> compliance), there's almost always one schema-backed or `tool_choice`-based
> answer and one prompt-only distractor — the schema-backed one wins.

## System prompts — the fundamental truth

- The system prompt is sent on **every single request**. There is no
  "initialization mode" where Claude remembers it forever after the first
  message — this is the same statelessness principle as the Context
  Management domain's "Claude does not remember previous API calls" rule,
  applied to the system prompt specifically.

> **Gotcha:** putting `"role": "system"` **inside** the `messages` array does
> not work as a system prompt — use the top-level `system` parameter.

### Structure beats prose

```xml
<role>Define the persona and its scope of authority</role>
<style>Tone, formatting, length constraints</style>
<safety>Guardrails, escalation triggers, hard limits</safety>
<examples>Contrasting input/output pairs</examples>
```

- **Principles** (judgment-heavy behavior): _"Adapt explanation depth to the
  user's demonstrated expertise."_ Give the model room to use judgment.
- **Conditionals** (safety bright lines): _"If the user describes an active
  emergency, direct them to call emergency services immediately."_ Use for
  non-negotiable rules only.
- **Long lists of conditionals often hurt more than they help** — they read
  as brittle rule-following rather than judgment, and edge cases outside the
  list fall through with no guidance at all.

### Few-shot examples beat written rules

- **2–4 targeted, contrasting examples with reasoning** typically outperform
  a long bullet list of instructions for teaching a nuanced behavior (e.g.
  "beginner-level explanation" vs. "expert-level explanation" shown as two
  worked examples, not described in prose).
- Vary the examples' surface structure so the model generalizes the
  _pattern_, not just the literal example — don't give four examples that
  are all trivial variations of the same input shape.

### Prompt dilution over long conversations

> **Gotcha:** system-prompt adherence measurably weakens as a conversation
> grows — **even before hitting the context limit.** The model's own prior
> outputs become part of the pattern it's continuing, and can gradually
> outweigh the original instructions. Mitigate with a concise,
> well-structured prompt, reinforced behavioral examples, and — for
> multi-day or very long sessions — treat the system prompt as something to
> **update between turns** (reflecting the current plan, what's already been
> completed) rather than a static one-time initialization.

## Structured output — pick the right guarantee mechanism

| Goal                                              | Mechanism                                      | Guarantees                                           |
| ------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Response body must be valid JSON matching a shape | `output_config.format` with a JSON Schema      | Grammar-compiled and validated — strongest guarantee |
| Extraction modeled as a tool call                 | Strict tool use with an input schema           | Forces the call to conform to the schema             |
| Tool use is optional                              | `tool_choice: "auto"`                          | Model **may** skip tools and respond in plain text   |
| Tool use is required, but which tool is unknown   | `tool_choice: "any"`                           | Model **must** call one of the provided tools        |
| A specific tool must run                          | Named tool (`{"type": "tool", "name": "..."}`) | That exact tool is called                            |
| No tools allowed for this turn                    | `tool_choice: "none"`                          | —                                                    |

> **Gotcha:** `tool_choice: "auto"` does **not** guarantee a tool gets
> called — the model may answer conversationally instead. This is one of
> the most repeated traps in the domain: any scenario needing _guaranteed_
> tool invocation needs `"any"` or a named tool, not `"auto"`.

> **Gotcha:** "respond with valid JSON" as a plain-text instruction (no
> schema, no tool) is fragile — the model can drift, add prose around the
> JSON, or produce near-valid-but-broken output. Schema-backed structured
> output is categorically more reliable and is the expected answer whenever
> it's offered as an option.

## Schema validates shape, not truth

> **Exam tip:** remember this distinction as two separate, sequential
> checks:
>
> 1. **Schema compliance** — is it valid JSON matching the required
>    structure? (Mechanical, guaranteed by the mechanism above.)
> 2. **Semantic validation** — do the values make sense? (Line items sum to
>    the stated total, dates fall in a valid range, referenced IDs actually
>    exist.) **This must be checked separately, in code** — a schema
>    guarantees shape, never semantics.

### Reducing fabrication in extraction

- Make fields **optional/nullable** if the source document may simply not
  contain that information — a nullable field lets the model correctly
  report absence instead of inventing a plausible-looking value to satisfy
  a required field.
- Prefer `null` over an invented value whenever information isn't present.
- Provide few-shot examples specifically covering **edge cases** (informal
  units, compound phrases, ambiguous categories) — this is where
  fabrication risk concentrates.
- For evolving or ambiguous category sets, give the schema an escape hatch:
  an `"other"` enum value paired with a free-text `*_detail` field, instead
  of a strict enum with no fallback.

> **Gotcha:** a strict enum **without** an `other`/escape-hatch value, used
> against a real-world domain that keeps producing new categories, is a
> classic wrong-answer setup — the model is forced to either fabricate a fit
> or silently misclassify.

### Validation feedback loop

When an extraction fails semantic validation, the effective fix is sending
back the **specific failure** — not a generic "try again":

> "Extraction failed validation: `line_items_total` (142.50) does not match
> `stated_total` (150.00). Return a corrected extraction."

This — original input, the failed output, and the exact validation error —
is far more effective than a blind retry with no diagnostic content.

## Batch API — the tradeoff is latency, not just cost

| Property     | Detail                                                       |
| ------------ | ------------------------------------------------------------ |
| Cost         | 50% savings vs. real-time                                    |
| Turnaround   | Up to 24 hours, **no SLA guarantee**                         |
| Tool calling | **No multi-turn tool calling within a single batch request** |
| Correlation  | Use `custom_id` on each request to match responses back      |

> **Gotcha:** the batch/real-time choice is fundamentally about **latency
> tolerance, not just cost.** "Route everything to batch for the 50%
> savings" is a wrong answer whenever the scenario describes a live,
> blocking, user-facing interaction — batch has no SLA and can't be used for
> anything the user is waiting on synchronously. Batch fits overnight
> reports and bulk offline processing; real-time API is required for live
> interactions.

- Refine prompts against a **small sample** before submitting a large batch
  — a systematic prompt flaw discovered after a 24-hour batch run is an
  expensive mistake to repeat.

## Multi-instance review and large-scale review structure

- Running an **independent review instance** — one that doesn't share the
  generating instance's context/reasoning — catches subtler issues than
  having the same instance review its own output (same principle as
  disabling model history for self-review in CI, in the Claude Code domain).
- For large multi-file reviews: a **per-file pass** for local issues, plus a
  **separate cross-file integration pass** for issues that only show up
  across files — don't try to do both in a single per-file pass (same
  decomposition idea as Agentic Architecture's code-review task-splitting).

## Explicit criteria over vague guidance

> **Gotcha:** an instruction like _"be conservative"_ or _"flag anything
> concerning"_ does **not** reliably reduce false positives — it's too
> vague to act as a real criterion. Replace it with concrete, checkable
> criteria: e.g. _"Flag a comment only when the claimed behavior directly
> contradicts what the code actually does,"_ with severity levels and
> worked examples for each.

## Scenario spotlight: Structured Data Extraction

This scenario bank leans almost entirely on this domain: schema design with
nullable fields, `tool_choice` semantics for unknown-document-type
extraction, the three-layer (schema/semantic/provenance) validation model,
and the validation-feedback-loop pattern for correcting failed extractions.

### Further reading

- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — system prompts, few-shot examples, XML tag structuring, long-context ordering.
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — `output_config.format`, JSON Schema support/limits, strict tool use, and validation guarantees.
- [Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) — `tool_choice` modes (`auto`/`any`/named/`none`) and forcing tool use.
- [Handling stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons) — the full `stop_reason` list and recommended handling per reason.
- [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing) — full batch lifecycle, JSONL result shape, `custom_id`, and per-request limits.
