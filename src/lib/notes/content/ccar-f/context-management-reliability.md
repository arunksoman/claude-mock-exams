## Scope of this domain

The smallest domain by weight (15%), but don't under-study it — it's where
"long conversation" and "production reliability" questions concentrate:
context-window management strategies, escalation and error-propagation
patterns, and confidence calibration for automated decisions.

## The stateless core principle

> **Note:** _"Claude does not remember previous API calls unless your
> application includes the relevant content in the next request."_ This one
> sentence underlies most of this domain.

- The full conversation history **and** the system prompt must be sent on
  **every** request — there is no server-side memory between calls.
- A `session_id` is _your application's_ database lookup key for retrieving
  stored history — it is not something the model itself remembers. The
  model only ever sees what's actually in the request body.
- Input token cost scales with conversation length — an unmanaged,
  ever-growing history gets more expensive (and slower) with every turn.

> **Gotcha:** "the session ID means Claude remembers the user" is a direct,
> repeated trap. A session ID finds stored history in your database; that
> history still has to be sent in the request for the model to have any
> awareness of it.

## Context-shrinking strategies

| Strategy                          | How it works                                                                                                                               | Weakness                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Sliding window**                | Keep the most recent N turns, drop older ones                                                                                              | Fails when the user references an earlier decision or exact figure that's been dropped |
| **Progressive summarization**     | Replace older blocks with a _structured_ summary (decisions, preferences, open questions, key facts); keep recent turns verbatim           | Summaries lose precision — not safe for exact values                                   |
| **Persistent reference sections** | Story bibles, defined terms, safety info, scale parameters — kept exact across the whole conversation, separate from general summarization | Needs to be maintained as its own block, not folded into the summary                   |
| **Structured state objects**      | A JSON object of current, relevant facts, included on every request and updated as things change                                           | Only as good as your discipline about updating it                                      |
| **Tool result compression**       | After processing a verbose tool result, keep only the fields actually needed downstream; drop internal metadata                            | Requires knowing in advance what's actually needed                                     |

```json
{
	"workspace_search": {
		"monthly_budget_max": 4200,
		"space_type": "private_office",
		"must_have": ["bike storage"],
		"no_longer_relevant": ["shared desk"]
	}
}
```

> **Gotcha:** for a **returning user**, don't resume the conversation by
> re-embedding stale tool output from their last session. Use a structured
> summary **plus a fresh state lookup** — the world may have changed since
> the last session (inventory, prices, availability), and stale embedded
> results will be presented as if they're current.

## "Lost in the middle" — context capacity ≠ attention

> **Gotcha:** a large context window does **not** mean every token in it
> gets equal attention. Models process content most reliably near the
> **beginning and end** of the input; middle content is more likely to be
> under-weighted. "Just put it in the 100K-token window, it'll all matter
> equally" is a wrong-answer premise.
>
> Mitigations: place key summaries and instructions at the **top** of the
> input, use explicit section headers so structure is easy to locate, and
> trim verbose content before it accumulates rather than relying on the
> model to find the needle later. When one pass genuinely can't hold
> everything reliably, split into multiple focused passes instead of
> enlarging the context window and hoping.

## Escalation patterns

**Escalate to a human when:**

- The user explicitly asks for one.
- The situation needs an authority/policy exception outside the agent's
  scope.
- A regulated approval is required.
- The agent genuinely cannot make progress (not just "the first attempt
  failed").
- Tool state is uncertain or a prior action may be unsafe to continue past.

> **Gotcha:** don't use **"N failed tool attempts"** as the sole escalation
> trigger, and don't route on customer **sentiment/frustration** alone.
> Category and actual impact matter more than a raw retry counter or
> detected frustration — a frustrated customer with an in-scope, resolvable
> request should still be resolved directly, not escalated just because
> they're annoyed.

### Escalation handoff — structured, not a transcript dump

```json
{
	"customer_id": "cust_193",
	"issue_type": "billing_adjustment",
	"root_cause": "subscription mismatch",
	"records": ["invoice_8841"],
	"amount": 72.15,
	"actions_taken": ["verified", "checked"],
	"recommended_next_action": "manager approval"
}
```

> **Gotcha:** handing off a raw transcript plus "please help this customer"
> is a repeated wrong-answer shape. A correct handoff is a **structured
> summary**: root cause, relevant records, what's already been tried, and a
> concrete recommended next action — this is the same "structured state,
> not raw transcript" principle that governs session resumption above.

## Error propagation between agents

- Subagents should return **structured error context** — failure type, what
  was attempted, any partial results, and viable alternatives — not a
  generic "it failed." This mirrors the Agentic Architecture domain's
  subagent-failure guidance and the Tool Design domain's structured
  tool-error shape; all three domains converge on the same pattern.
- Explicitly distinguish an **access failure** (couldn't reach the data)
  from a **valid empty result** (reached it, nothing matched) — collapsing
  the two prevents correct recovery upstream.

## Confidence calibration

> **Gotcha:** a reported `"confidence": 0.92` does **not** mean a 92%
> chance of correctness. Confidence scores need calibration against a real,
> labeled validation set before you trust them for a threshold decision.
>
> - **97% overall accuracy can mask poor performance on a specific
>   segment** — always break accuracy down by document type, field, or
>   source quality before raising an automation threshold or trusting an
>   aggregate number.
> - Use stratified sampling to build the validation set, and route
>   low-confidence or known-weak-segment extractions to human review rather
>   than trusting a single global threshold.

## Information provenance

- Preserve claim-to-source mappings: source URL/document name, an excerpt,
  and a publication/effective date — for every fact a system asserts.
- If two sources conflict, **surface the conflict** rather than silently
  picking one — arbitrary source selection hides a disagreement a human
  reviewer needs to see.

## Graceful degradation

- When something partially fails, tell the user what **succeeded**, what's
  **pending**, and what the **next step** is — don't claim a side effect
  happened if it wasn't actually confirmed.
- If the same tool keeps failing, **switch strategies** rather than
  retrying the identical call indefinitely.

## Compliance enforcement — code, not prompts

> **Exam tip:** this is the Context/Reliability domain's expression of the
> exam's core enforcement-over-guidance theme. Hard compliance rules (a
> dollar threshold, a required approval step) belong in code:
>
> - **Threshold checks inside the tool itself**, not as an instruction to
>   the model to "check the amount is under $X."
> - **Preview-then-execute pattern**: generate a preview/confirmation token
>   for a sensitive action, then require that exact token to actually
>   execute it — this makes "did the user really confirm this" a structural
>   check, not an assumption.
> - **Server-side re-authorization on every invocation** of a sensitive
>   tool, rather than trusting that an earlier authorization in the
>   conversation still holds.

> **Gotcha:** storing a password, API key, or other secret in a system
> prompt or in CLAUDE.md is a direct wrong-answer setup — use environment
> variables or a secrets manager, never inline prompt/config text.

## Scenario spotlight: Developer Productivity and Customer Support

The Customer Support Resolution Agent scenario draws heavily on escalation
triggers and handoff structure; Developer Productivity and CI scenarios
draw on the scratchpad/manifest-export side of context management (large
codebases, `/compact`, crash-recoverable state) — see the Claude Code
Configuration domain for those specifics.
