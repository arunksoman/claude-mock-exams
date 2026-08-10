## Messages API core mechanics

Everything in the Claude API funnels through **one endpoint**: `POST /v1/messages`. There is no separate "chat" vs "completion" endpoint — tools, vision, caching, and streaming are all just parameters on this same call.

> **Exam tip:** If a question describes "the core Claude API endpoint," the answer is `POST /v1/messages`, not `/v1/completions` (that's the deprecated legacy Text Completions API).

- Required request fields:
  - `model` — the model id string, e.g. `claude-opus-4-6` (never guess/invent an id — exact strings matter).
  - `max_tokens` — a **hard ceiling** on generated output tokens (thinking + text, when thinking is on). It is *not* a target length, and it is not aware to the model unless you separately configure a task budget.
  - `messages` — an array of turns, each `{"role": ..., "content": ...}`.
- Common optional fields: `system` (the system prompt, a string or array of text blocks), `temperature`/`top_p`/`top_k` (sampling — **removed/rejected on several current models**, see the migration gotcha below), `stop_sequences`, `stream`, `tools`, `tool_choice`, `thinking`, `output_config` (effort + structured-output format).

### Roles and turn structure

- `` `role` `` is `"user"` or `"assistant"` for the normal back-and-forth. The API is **stateless** — every request resends the *entire* conversation history; Claude has no memory between calls unless you pass it back yourself.
- **Alternation rule:** the array must alternate `user` → `assistant` → `user` ...; the first message must be `role: "user"`. Sending two consecutive same-role messages or starting with `assistant` returns a `400 invalid_request_error`.
- `` `content` `` can be a plain string (shorthand for a single text block) or an **array of content blocks** — this is what lets one turn mix text, images, documents, tool results, etc.

```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "system": "You are a concise technical assistant.",
  "messages": [
    { "role": "user", "content": "What's the capital of France?" },
    { "role": "assistant", "content": "Paris." },
    { "role": "user", "content": "And Germany?" }
  ]
}
```

### Content block types worth memorizing

| Block type | Appears in | Purpose |
|---|---|---|
| `text` | request & response | Plain text, optionally with `citations` |
| `image` | request | `source.type` is `base64`, `url`, or `file` (Files API) |
| `document` | request | PDFs/text docs; same three source types plus `text`/`content` |
| `thinking` / `redacted_thinking` | response (and echoed back in request) | Extended/adaptive reasoning output |
| `tool_use` | response | Claude requesting a tool call |
| `tool_result` | request | Your answer to a `tool_use` |
| `server_tool_use` / `*_tool_result` | response | Server-side tools (web search, code execution, etc.) |

### Response shape

- `id`, `type: "message"`, `role: "assistant"`, `model`, `content` (array of blocks), `stop_reason`, `stop_sequence`, `usage`.
- `` `stop_reason` `` — memorize this list, it is exam-favorite territory:

| `stop_reason` | Meaning |
|---|---|
| `end_turn` | Claude finished naturally |
| `max_tokens` | Hit the `max_tokens` cap — response may be truncated |
| `stop_sequence` | Hit a custom stop sequence |
| `tool_use` | Claude wants to call a tool — execute it and continue |
| `pause_turn` | A long server-side-tool turn paused; resend to resume |
| `refusal` | Safety classifiers declined — check `stop_details` |
| `model_context_window_exceeded` | Hit the **context window**, not the output cap |

> **Gotcha:** `max_tokens` truncation and `model_context_window_exceeded` are two *different* failure modes tested separately on the exam — one is "you asked for too little output," the other is "the whole conversation no longer fits."

- `` `usage` `` reports `input_tokens`, `output_tokens`, plus cache fields (see the caching section below).

### Multi-turn shape in practice

Every follow-up request must include the *full* prior exchange, including any `tool_use`/`tool_result` pairs and (unmodified) `thinking` blocks from the immediately preceding assistant turn. Dropping or editing a `thinking` block from the latest assistant turn before resending it is a `400`.

> **Note:** A top-level `system` parameter is the normal way to set a system prompt. Some current models also accept a `role: "system"` entry *inside* the `messages` array for injecting operator instructions mid-conversation without disturbing the cached prefix — this is a narrower, newer mechanism, not the default way to set instructions.

---

## Streaming responses

Set `` `"stream": true` `` on the request to receive the response incrementally over **{{SSE|Server-Sent Events: a one-directional HTTP streaming protocol built on a long-lived HTTP connection}}** instead of waiting for the full JSON body.

- **Why stream:**
  - Perceived latency — show tokens as they're generated instead of a blank screen.
  - Avoiding client/proxy HTTP timeouts on long generations — the SDKs *require* streaming once `max_tokens` gets large (roughly above ~16K on non-streaming calls) precisely to dodge this.
  - Building responsive chat UIs and progress indicators for agentic loops.

### Event flow

```mermaid
sequenceDiagram
    participant Client
    participant API as Claude API
    Client->>API: POST /v1/messages (stream: true)
    API-->>Client: event: message_start
    API-->>Client: event: content_block_start (index 0)
    loop token deltas
        API-->>Client: event: content_block_delta
    end
    API-->>Client: event: content_block_stop (index 0)
    API-->>Client: event: message_delta (stop_reason, usage)
    API-->>Client: event: message_stop
```

- **`message_start`** — a `Message` object with empty `content`; carries the initial (small) `usage`.
- **`content_block_start` / `content_block_delta` / `content_block_stop`** — one triplet per content block. Each block has an `index` matching its position in the final `content` array.
- **`content_block_delta`** carries a typed `delta`:
  - `text_delta` — `{ "text": "..." }` for plain text.
  - `input_json_delta` — `{ "partial_json": "..." }` for a `tool_use` block's `input`; accumulate the string fragments and parse once the block closes (the final value is always parseable JSON, the deltas are not).
  - `thinking_delta` / `signature_delta` — extended/adaptive thinking content, when `display: "summarized"` is set.
- **`message_delta`** — top-level changes (notably the final `stop_reason`) plus a **cumulative** `usage` update.
- **`message_stop`** — terminal event.
- **`ping`** — keep-alive, no payload significance; ignore it.
- **`error`** — can appear *mid-stream after an HTTP 200* (e.g. `overloaded_error`) — this bypasses normal HTTP-status error handling, so streaming clients need a separate error-event handler.

> **Exam tip:** The exam likes to test that `usage` in `message_delta` is **cumulative**, not a delta-of-tokens-this-event, and that streaming errors can arrive after a 200 status — both are easy to get wrong if you assume streaming behaves like a single failable HTTP call.

> **Gotcha:** Every SDK offers a way to just get the complete message back after consuming a stream internally (`stream.get_final_message()` in Python, `stream.finalMessage()` in TypeScript) — this is the recommended way to use streaming for large `max_tokens` when you don't actually need to render partial output. Don't hand-roll event accumulation unless you need per-token behavior.

```python
with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=64000,
    messages=[{"role": "user", "content": "Write a detailed report..."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final_message = stream.get_final_message()
```

---

## Vision & multimodal input

### Images

- Provide images as `image` content blocks with a `source`:
  - `` `{"type": "base64", "media_type": "image/png", "data": "..."}` `` — inline bytes.
  - `` `{"type": "url", "url": "https://..."}` `` — hosted reference (not available on Amazon Bedrock/Vertex — base64 only there).
  - `` `{"type": "file", "file_id": "..."}` `` — a file previously uploaded via the **Files API**.
- Supported formats: **JPEG, PNG, GIF, WebP**. Animated images are not supported — only the first frame is read.
- Request limits (may change — verify against current docs): up to **100 images per request** on 200k-context models, **600** on others; max **8000×8000 px** per image; max **10 MB** base64-encoded per image on the direct API (5 MB on Bedrock/Vertex).
- Image-then-text ordering performs slightly better than text-then-image, same principle as putting long documents before your question in text prompts.

**Token cost is resolution-based**, not file-size-based. Claude tiles images into 28×28-pixel patches ("visual tokens"):

$$
\text{visual tokens} = \left\lceil \frac{\text{width}}{28} \right\rceil \times \left\lceil \frac{\text{height}}{28} \right\rceil
$$

- Two resolution tiers gate the max size before downscaling kicks in: a **standard tier** (older models, long-edge cap ~1568px, ~1568 max visual tokens) and a **high-resolution tier** (newer models, long-edge cap ~2576px, ~4784 max visual tokens). Oversized images are downscaled to fit, preserving aspect ratio — you're never billed for more than the tier cap.

> **Gotcha:** A common exam trap is assuming smaller *file size* means cheaper request — it's **pixel dimensions** that drive token cost, not JPEG compression level. A heavily-compressed but high-resolution image can still cost far more tokens than a small, uncompressed one.

### PDFs and documents

- PDFs use the `document` content block, same three source types as images (`base64`, `url`, `file`) plus `text` and `content` for pre-extracted text.
- Claude reads **both the text and the visual layout** of a PDF (charts, tables, scanned pages) — it's not a pure text-extraction pipeline.
- Limits (verify against current docs — these shift over time): request payload up to **32 MB**; up to **600 pages** per request (dropping to **100 pages** when the effective context window is under 1M tokens).

```json
{
  "type": "document",
  "source": { "type": "base64", "media_type": "application/pdf", "data": "<base64>" },
  "citations": { "enabled": true }
}
```

### Files API — base64 vs. file references

- Base64-embedding is simplest for one-off requests, but in **multi-turn conversations the full bytes get resent on every turn** since the API is stateless — this bloats payloads and latency as history grows.
- The **Files API** (`POST /v1/files`, beta header `` `files-api-2025-04-14` ``) uploads once and returns a `file_id` you reference repeatedly via `{"type": "file", "file_id": "..."}` — the bytes are stored server-side and never re-transmitted.
- Files are workspace-scoped (any API key in that workspace can read them) and, per current docs, capped around **500 MB per file** / **500 GB per organization** — treat these as illustrative, not load-bearing, numbers.
- Endpoints: `POST /v1/files` (upload), `GET /v1/files` (list), `GET /v1/files/{id}` (metadata), `GET /v1/files/{id}/content` (download — only for files *generated* by skills/code execution, not ones you uploaded), `DELETE /v1/files/{id}`.

> **Exam tip:** Know the tradeoff, not just the mechanism — base64 is simpler and needs no extra endpoint, but the Files API is the right call for images/PDFs reused across many requests or accumulating in long conversation history.

---

## Prompt caching mechanics

Prompt caching lets you avoid re-processing (and re-paying full price for) the parts of a prompt that don't change between requests — a large system prompt, a big retrieved document, a fixed tool list.

> **Note:** This section is the API-mechanics view. Cost/latency tradeoffs and cache-strategy design live in a sister notes file — here the focus is exact field names and how the mechanism works.

- **The core invariant: caching is a {{prefix cache|keyed to the exact byte sequence of the rendered prompt up to a marked point — any change anywhere in that prefix invalidates everything after it}}.** A single changed character invalidates every cache breakpoint positioned after it.
- **Render order** is fixed: `tools` → `system` → `messages`. A breakpoint on the last system block caches tools + system together.
- Mark a cache boundary with `` `cache_control` `` on a content block:

```json
{
  "type": "text",
  "text": "<large, stable system prompt>",
  "cache_control": { "type": "ephemeral" }
}
```

- `` `cache_control` `` can also carry an explicit TTL: `` `{"type": "ephemeral", "ttl": "5m"}` `` (default) or `` `"1h"` ``.
- Up to **4 cache breakpoints** per request.
- There is a **minimum cacheable prefix length** — shorter prompts silently don't cache (no error, just zero cache tokens). The exact minimum is model-dependent and has ranged roughly from 512 to a few thousand tokens across model generations — don't memorize a single number, know that a minimum exists and varies by model.

### Cache read vs. write, and how to verify it

- `` `usage.cache_creation_input_tokens` `` — tokens **written** to the cache this request.
- `` `usage.cache_read_input_tokens` `` — tokens **served from** the cache this request.
- `` `usage.input_tokens` `` — the uncached remainder only. Total prompt size = the sum of all three fields.
- If `cache_read_input_tokens` stays at zero across repeated, supposedly-identical requests, something in the prefix is silently changing (a timestamp, a non-deterministically-serialized JSON object, a varying tool set) — that's a standard debugging scenario the exam may pose.

> **Gotcha:** Adding, removing, or reordering **tools**, or switching the **model**, invalidates the cache — both render at/near the very front of the prompt. Toggling `tool_choice` or `thinking` on/off, by contrast, only invalidates the *messages* tier, not tools/system — the API has a tiered invalidation hierarchy, not one all-or-nothing cache.

```mermaid
flowchart LR
    A["tools[]"] --> B["system"]
    B --> C["messages[]"]
    A -.cache breakpoint here.-> D["caches tools + system"]
```

---

## Tool use at the API level

> **Note:** Tool *design* (schemas, choosing what to expose, agent loop patterns) is covered in depth in a sister "Tools & MCPs" file. This section is strictly how `tool_use`/`tool_result` blocks flow through `POST /v1/messages`.

- Declare tools in the top-level `` `tools` `` array — each has `name`, `description`, and a JSON Schema `` `input_schema` ``.
- `` `tool_choice` `` controls whether/which tool gets used: `` `{"type": "auto"}` `` (default — Claude decides), `` `{"type": "any"}` `` (must use *some* tool), `` `{"type": "tool", "name": "..."}` `` (must use this specific tool), `` `{"type": "none"}` ``.
- When Claude wants to call a tool, the response's `content` includes a `` `tool_use` `` block: `{"type": "tool_use", "id": "toolu_...", "name": "...", "input": {...}}`, and `` `stop_reason` `` is `"tool_use"`.
- Your application executes the tool, then sends the result back as a `` `tool_result` `` block **inside a new `user` message**:

```json
{
  "role": "user",
  "content": [
    { "type": "tool_result", "tool_use_id": "toolu_01A...", "content": "72°F and sunny", "is_error": false }
  ]
}
```

- **Parallel tool calls:** one assistant turn can contain multiple `tool_use` blocks. Execute them concurrently and return **all** the matching `tool_result` blocks in a **single** subsequent user message — splitting them across multiple messages is a common mistake that silently discourages future parallel calls.
- Failed tool executions still get a `tool_result` — just set `` `"is_error": true` `` rather than omitting the block.

> **Exam tip:** The request/response round trip for tool use is: assistant turn with `tool_use` → you execute → user turn with `tool_result` → repeat until `stop_reason` is `end_turn`. This loop, not the tool schema itself, is what the exam tends to probe for the "Applications & Integration" angle (schema design is the Tools & MCPs domain).

---

## Official SDKs

Anthropic maintains official SDKs that wrap `POST /v1/messages` (and the other endpoints) with typed methods, streaming helpers, automatic retries, and typed exceptions.

| Language | Package | Install |
|---|---|---|
| Python | `anthropic` | `pip install anthropic` |
| TypeScript / JavaScript | `@anthropic-ai/sdk` | `npm install @anthropic-ai/sdk` |
| Java | `com.anthropic:anthropic-java` | Maven/Gradle |
| Go | `github.com/anthropics/anthropic-sdk-go` | `go get` |
| Ruby | `anthropic` gem | `gem install anthropic` |
| C# | `Anthropic` (NuGet) | `dotnet add package Anthropic` |
| PHP | `anthropic-ai/sdk` | `composer require` |

### Python

```python
import os
from anthropic import Anthropic

client = Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),  # default; can be omitted
)

message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello, Claude"}],
)
print(message.content)
```

### TypeScript

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"], // default; can be omitted
});

const message = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude" }],
});

console.log(message.content);
```

> **Exam tip:** The client constructor reads `` `ANTHROPIC_API_KEY` `` from the environment by default — the exam may test that you *don't* need to pass `apiKey`/`api_key` explicitly if that env var is set, and that hardcoding a key in source is the wrong pattern (see architecture section below).

> **Gotcha:** "SDK" vs. "raw HTTP" is a real design decision, not just style — the SDKs add typed exceptions, automatic retry-with-backoff, streaming accumulation helpers, and request-size/timeout handling you'd otherwise reimplement. Default to the official SDK unless the project is explicitly a shell/cURL integration or has no SDK for its language.

---

## Auth, error handling & retries

### Authentication

- Standard auth: the `` `x-api-key` `` header carries your API key, alongside `` `anthropic-version: 2023-06-01` `` (a required API-version header — not optional).
- OAuth-style short-lived tokens (from CLI login flows, etc.) use `` `Authorization: Bearer <token>` `` **plus** an `` `anthropic-beta: oauth-2025-04-20` `` header — this is a different header pair from the API-key path, not just a drop-in swap.

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-opus-4-6", "max_tokens": 1024, "messages": [{"role": "user", "content": "Hello"}]}'
```

### HTTP status codes

| Code | `error.type` | Retryable? | Typical cause |
|---|---|---|---|
| 400 | `invalid_request_error` | No | Malformed request, bad params, non-alternating roles |
| 401 | `authentication_error` | No | Missing/invalid/expired API key |
| 402 | `billing_error` | No | Billing/payment issue on the account |
| 403 | `permission_error` | No | Key lacks access to the resource/model |
| 404 | `not_found_error` | No | Bad endpoint path or model id |
| 409 | `conflict_error` | Situational | Resource modified concurrently / uniqueness conflict |
| 413 | `request_too_large` | No | Payload over the endpoint's size limit |
| 429 | `rate_limit_error` | **Yes** | RPM/ITPM/OTPM exceeded |
| 500 | `api_error` | **Yes** | Anthropic-side issue |
| 504 | `timeout_error` | Situational | Request timed out server-side — consider streaming |
| 529 | `overloaded_error` | **Yes** | Temporary capacity overload |

> **Exam tip:** Request size caps differ **per endpoint**, not one global number — roughly Messages API 32 MB, Batch API 256 MB, Files API 500 MB (verify current figures against the docs; these limits do get revised).

- Every error response is JSON with a top-level `` `error: {type, message}` `` object and a `` `request_id` `` — include the `request_id` when filing a support ticket.
- Every response (success or error) carries a `` `request-id` `` header too, for correlating logs even when you didn't capture the body.

### Retry-with-backoff

```mermaid
flowchart TD
    A[Send request] --> B{HTTP status}
    B -->|2xx| C[Success]
    B -->|400 / 401 / 403 / 404| D[Non-retryable: fix request or auth]
    B -->|429 / 500 / 529| E{Retries remaining?}
    E -->|Yes| F["Wait (retry-after header, or exponential backoff)"]
    F --> A
    E -->|No| G[Surface error to caller]
```

- The official SDKs **retry automatically** on connection errors, 429, and 5xx-class responses, using exponential backoff, **twice by default** (`max_retries`, configurable per-client or per-request).
- When present, honor the `` `retry-after` `` header (seconds to wait) rather than a fixed backoff schedule — it reflects server-side knowledge your client doesn't have.
- Rate-limit response headers to know: `` `anthropic-ratelimit-requests-limit/remaining/reset` ``, `` `anthropic-ratelimit-input-tokens-limit/remaining/reset` ``, `` `anthropic-ratelimit-output-tokens-limit/remaining/reset` `` (RFC 3339 timestamps for `reset`).
- Rate limits are enforced per **RPM** (requests/minute), **ITPM** (input tokens/minute), and **OTPM** (output tokens/minute), tracked **per model** — different models draw from separate pools.

> **Gotcha:** `max_tokens` does **not** factor into OTPM limit calculations — OTPM is metered on tokens actually produced, so setting a generous `max_tokens` "just in case" has no rate-limit downside (though it does affect your hard truncation ceiling and, on some models, thinking budget).

### Idempotency

> **Gotcha:** Unlike some REST/payment APIs, the Messages API has **no built-in idempotency-key parameter** for `POST /v1/messages`. A retried request after a dropped connection may generate and bill a *new* completion rather than returning the original one — this is a real operational consideration for retry logic, and a plausible exam distractor (don't assume every API in this domain works like Stripe's idempotency keys). The Batch API sidesteps this differently: you supply your own `` `custom_id` `` per sub-request so you can safely de-duplicate results by key.

---

## Batch API vs. real-time processing

| | Messages API (real-time) | Message Batches API |
|---|---|---|
| Endpoint | `POST /v1/messages` | `POST /v1/messages/batches` |
| Latency | Seconds (or streamed) | Async — most complete in under an hour, up to ~24h |
| Cost | Standard pricing | **~50% discount** on token usage |
| Result ordering | N/A — one response per call | **Arbitrary** — key results by `custom_id`, never by position |
| Use when | User is waiting; interactive UX | Large volumes, no immediate-response requirement |

- Create a batch by submitting an array of sub-requests, each wrapped with your own `` `custom_id` `` and normal `params` (model, max_tokens, messages, etc.) — effectively many independent Messages API calls bundled together.
- Poll `` `GET /v1/messages/batches/{id}` `` until `` `processing_status` `` is `` `"ended"` ``, then stream results via the batch's results endpoint.
- Each result carries `` `custom_id` `` plus `` `result.type` `` — `` `succeeded"` ``, `` `"errored"` ``, `` `"canceled"` ``, or `` `"expired"` ``. On success, read `` `result.message.content` `` exactly as you would a normal Messages response.
- Batch sub-requests support essentially the full Messages API surface — vision, tools, caching, structured outputs.

> **Exam tip:** The exam's classic "which should you use" framing: **real-time** for anything a human is waiting on (chat, live agent turns); **batch** for bulk, latency-insensitive workloads — content moderation sweeps, large-scale evals, offline classification/extraction over a dataset. The 50% discount and async, poll-based lifecycle are the two facts most likely to be tested directly.

> **Gotcha:** Batch results can arrive in **any order** relative to submission — code that assumes result N corresponds to submitted request N will silently mismatch. Always index by `custom_id`.

```python
batch = client.messages.batches.create(
    requests=[
        {
            "custom_id": "request-1",
            "params": {
                "model": "claude-opus-4-6",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": "Summarize this document..."}],
            },
        },
    ]
)
# Poll client.messages.batches.retrieve(batch.id).processing_status until "ended",
# then iterate client.messages.batches.results(batch.id), keyed by custom_id.
```

---

## Application architecture & configuration management

Turning a single API call into a production application means treating a few concerns as first-class design decisions, not afterthoughts.

### Secrets and configuration

- **Never hardcode an API key in source.** Read it from an environment variable (`` `ANTHROPIC_API_KEY` `` is the SDK default) or a secrets manager; the SDK client constructor picks it up automatically with no explicit argument needed.
- Separate **config from code**: model id, `max_tokens`, `temperature`/`effort`, system prompt text, and feature flags (which tools are enabled, whether streaming is on) should live in environment variables, a config file, or a remote config service — not hardcoded inline — so you can change behavior without a redeploy and can run different configs per environment (dev/staging/prod).
- `` `base_url` `` (or the `` `ANTHROPIC_BASE_URL` `` env var) lets you point the client at a proxy or an alternate regional/partner endpoint without code changes — useful for routing through an internal gateway that adds logging or rate limiting.

### Timeouts

- The SDK clients set a **default request timeout** (commonly around 10 minutes) and validate that non-streaming requests aren't likely to exceed it given the requested `max_tokens` — this is *why* large `max_tokens` values push you toward streaming.
- Timeouts are typically **retried** by the SDK's automatic retry logic, so worst-case wall-clock time can be roughly `timeout × (max_retries + 1)` — a detail worth accounting for in any caller-facing SLA.
- Per-request timeout overrides are supported by every SDK (e.g. `` `client.with_options(timeout=5.0)` `` in Python) for latency-sensitive call sites that should fail fast rather than wait the full default.

### Request/response separation of concerns

- Keep prompt construction (system prompt, tool definitions, message history assembly) in one layer, and the raw API call/retry/error-handling in another — this also happens to be exactly what good **prompt caching** design wants: stable, deterministic prompt-building code with volatile data appended last.
- Log `` `request_id` `` (from the response header or body) alongside your own request/trace ids so a support ticket or an error in production can be traced back to a specific API call.
- Decide **once**, centrally, whether a given call path is real-time or batch-eligible — retrofitting batch processing into a codebase that assumes synchronous responses everywhere is far more expensive than designing the split in from the start.

> **Exam tip:** Questions in this area tend to probe *judgment*, not syntax — recognizing that a key in a committed config file is a security problem, that a fixed `max_tokens` hardcoded across every environment is an architecture smell, or that ignoring `retry-after` in favor of a naive fixed-interval retry loop is worse than using the SDK's built-in backoff.

### Further reading

- [Messages API reference](https://platform.claude.com/docs/en/api/messages) — full request/response schema for `POST /v1/messages`.
- [Streaming Messages](https://platform.claude.com/docs/en/build-with-claude/streaming) — SSE event types, deltas, and error-recovery patterns.
- [Vision](https://platform.claude.com/docs/en/build-with-claude/vision) — image formats, limits, and token-cost mechanics.
- [PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support) — document content blocks and page/size limits.
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — `cache_control`, breakpoints, and cache economics.
- [Files API](https://platform.claude.com/docs/en/build-with-claude/files) — upload/reference/download flow and beta header.
- [API errors](https://platform.claude.com/docs/en/api/errors) — full HTTP error code reference and SDK exception types.
- [Rate limits](https://platform.claude.com/docs/en/api/rate-limits) — RPM/ITPM/OTPM tiers and rate-limit response headers.
