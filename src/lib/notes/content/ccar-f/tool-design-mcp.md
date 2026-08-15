## Scope of this domain

How tools are designed, described, secured, and integrated — including MCP
(Model Context Protocol) servers specifically. At 18% this is the middle
domain by weight, but it's foundational vocabulary the Agentic Architecture
and Context Management domains both lean on.

> **Exam tip:** the recurring theme is _"tool descriptions are the primary
> mechanism the model uses for tool selection"_ — not the system prompt,
> not the function name. Questions about unreliable tool routing almost
> always trace back to vague or overlapping descriptions.

## Tool descriptions drive routing

- Tool selection depends primarily on the **description text**, not the
  system prompt and not the literal function name. Two tools with
  overlapping, generic descriptions cause unreliable routing even if their
  names sound different.
- A vague interface produces model errors that **look like reasoning
  failures** but are actually a tool-design problem — the model guessed
  wrong between two under-differentiated tools.

> **Gotcha:** renaming a generically-named, overlapping tool (e.g.
> `analyze_content` used for several unrelated purposes) to something
> specific like `extract_web_results` is a real fix tested on the exam —
> not a cosmetic one. If a question's symptom is "the model keeps picking
> the wrong tool between two similar options," the fix is sharper
> descriptions/names, not a longer system prompt telling it which to prefer.

### A complete tool signature

| Element             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| What it does        | Core function, one sentence                       |
| When to use         | Positive trigger conditions                       |
| When **not** to use | Explicit boundary vs. similar tools               |
| Input format        | Parameter shapes and constraints                  |
| Output shape        | What the caller gets back                         |
| Limitations         | Known constraints (rate limits, staleness, scope) |
| Safety concerns     | Anything destructive or irreversible              |
| Examples            | Concrete input/output pairs                       |

## Parameter design patterns

| Pattern                       | Example                                                                           | Why it matters                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Enums for stable, closed sets | `source: ["kb", "billing", "tickets"]`                                            | Removes ambiguity a free-text field would invite                                  |
| Lookup-then-act               | search → get an id → act on that id                                               | Prevents acting on the wrong target from an ambiguous name                        |
| Stable identifiers            | Accept `device_id`; resolve display details internally                            | Reduces coupling to whatever the caller happens to have on hand                   |
| Split interdependent tools    | `log_cardio` vs. `log_strength` as separate tools, not one generic `log_activity` | The schema itself encodes constraints instead of relying on prose to explain them |

> **Gotcha:** encoding a format hint **into the parameter name** —
> `date_string_iso_yyyy_mm_dd` — is a wrong-answer pattern. Put format
> constraints in the schema's `description` and validation, not in an
> increasingly awkward parameter name.

## Output design

- Include **IDs** in tool output that a downstream tool call can reference
  directly — don't force the model to re-derive an identifier from
  free text.
- Distinguish an **empty result** (a valid "nothing found," success) from an
  **error** (the lookup itself failed) — collapsing these into one shape is
  a common cause of a coordinator mishandling a legitimate empty result as
  if something broke (echoed from the Agentic Architecture domain's
  subagent-failure guidance).
- Return **normalized** data, not a raw upstream payload dumped verbatim —
  strip internal metadata the model doesn't need to reason over.
- Include structured decision hints where relevant, e.g. `"requires_review":
true` paired with a calibrated `reason`, rather than leaving the model to
  infer when something needs escalation from prose alone.

## Composition rules for combined/composite tools

- Combine steps into one tool only when the sequence is **purely
  mechanical** with no judgment call embedded in it.
- Keep any actual decision **outside** the composite tool, in the model's
  reasoning — don't hide a choice inside a black-box multi-step tool where
  the model can't see or influence it.
- Let a tool resolve its own internal dependencies only when doing so
  requires no judgment (e.g. resolving a stable id to a record) — anything
  requiring judgment stays a separate, visible step.

## Error classification — five categories

| Category                 | Example                                   | Correct handling                                             |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------ |
| Transient infrastructure | Timeout, `503`                            | Retry **inside the tool** with backoff                       |
| Permanent validation     | Bad date, invalid enum value              | Return structured detail; let the agent correct and resubmit |
| Business rule            | Ineligible, duplicate, insufficient funds | **Not** retryable — explain to the user                      |
| Permission               | User lacks access                         | **Not** retryable — suggest a permission-request path        |
| Uncertain write state    | Timeout **after** a submit call           | Report uncertainty; **do not auto-retry**                    |

> **Gotcha:** the read/write distinction on retries is heavily tested —
> **reads** can safely retry on a timeout. **Writes cannot**, because a
> timeout after submission leaves you unsure whether the write actually
> landed; blind retry risks a duplicate (double-charge, duplicate ticket).
> Marking an uncertain-write-state error as `"retryable": true` is a direct
> cause of duplicate side effects and a repeated wrong-answer setup.

### Tool errors as structured results, not exceptions

```json
{
	"success": false,
	"error_category": "business_rule",
	"retryable": false,
	"code": "warranty_window_closed",
	"customer_explanation": "This device is outside its warranty period.",
	"next_steps": ["offer_paid_repair", "escalate_for_exception"]
}
```

Returning a structured error object — category, retryability, an
explanation, and viable next steps — gives the model (and any downstream
code) enough to act correctly, unlike a bare exception or a generic failure
string.

## MCP error tiers — two different layers

| Tier                                       | Example                                                                            | Handling                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Protocol error** (JSON-RPC)              | Malformed request, unknown tool, missing required parameter                        | Refuse the call outright — this is a client/protocol bug                           |
| **Tool execution error** (`isError: true`) | Remote `404`, `503`, permission denied — the operation ran but failed semantically | Return a structured error result for the model to reason over, same shape as above |

## MCP's three building blocks

| Building block | Controlled by    | Used for                                                  |
| -------------- | ---------------- | --------------------------------------------------------- |
| **Tools**      | Model            | Actions — search, update, create, send, analyze           |
| **Resources**  | Application      | Passive context — schemas, docs, catalogs, API references |
| **Prompts**    | User/application | Reusable workflows — checklists, templates, playbooks     |

> **Exam tip:** the **Resource vs. Tool** distinction is one of the
> highest-yield facts in this domain. A **Resource** is something the agent
> reads _before_ acting to see what exists (a database schema, a doc
> catalog) — it doesn't require live computation. A **Tool** is something
> that requires computation or a live lookup at the moment it's used
> (current order state, a live query). Exposing a database schema as a
> Resource — instead of forcing the agent to discover it through repeated
> exploratory tool calls — measurably reduces wasted tool calls.

- Tool **annotation hints** (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`) are **untrusted hints for UI display**,
  not a security boundary — a misbehaving or malicious server could set
  them inaccurately. Never substitute an annotation for an actual
  permission check.

## MCP configuration scoping in Claude Code

| Location                                    | Scope                                          | Precedence                     |
| ------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| `.mcp.json` (project root)                  | Project-level, version-controlled, team-shared | Base layer                     |
| `~/.claude.json`, project-path-scoped entry | Personal override for a specific project       | Overrides project              |
| `~/.claude.json`, user-global entry         | Personal, applies everywhere                   | Lowest precedence of the three |

- Effective precedence is **local > project > user**, and the winning entry
  is used **whole** — fields are not merged field-by-field across levels.
- Use `${ENV_VAR}` expansion for secrets (e.g. `${GITHUB_TOKEN}`) in MCP
  server configuration — **never** commit a literal secret into `.mcp.json`.

## Progressive tool availability

- When many MCP servers are connected at once, surface **discovery tools**
  first rather than every server's full tool list up front — dynamically
  add the specific tools relevant to what's been discovered on subsequent
  turns. This prevents the "tool list explosion" that degrades selection
  quality, the same failure mode tool-distribution limits address for
  subagents in the Agentic Architecture domain.

> **Gotcha:** building one aggregator "natural language tool router" tool
> that wraps many underlying tools behind a single free-text interface is a
> wrong-answer pattern — it hides the real tool surface from the model
> instead of letting well-described individual tools do their job. Fix
> overlapping/confusing tools by improving their descriptions, not by
> burying them behind another layer of indirection.

## Scenario spotlight: Customer Support Resolution Agent

Leans on this domain for: distinguishing business-rule errors (not
retryable, needs a human-readable explanation) from transient ones (retry
with backoff), structured escalation-worthy tool output (`requires_review`
plus reason), and MCP resource use for exposing a knowledge base without
burning tool calls on repeated lookups.
