## Defining tools: the `tools` array

- Tool use lets Claude call functions **you** define or that Anthropic provides. You send a `tools` array on a Messages API request; Claude decides whether to emit a `tool_use` block asking your code (or Anthropic's infrastructure) to run one.
- **Client tools** (your own custom tools, plus Anthropic-schema tools like `bash` and `text_editor`) run in *your* application — Claude just returns the request, you execute it.
- **Server tools** (`web_search`, `web_fetch`, `code_execution`, `tool_search`, the MCP connector) run on Anthropic's infrastructure — you never write handler code for them.
- Each custom tool definition has three required fields:
  - `` `name` `` — matches `^[a-zA-Z0-9_-]{1,64}$`. Use clear, specific names (`get_stock_price`, not `stock`); namespace by service when you have many tools (`github_list_prs`, `slack_send_message`).
  - `` `description` `` — a plaintext explanation of what the tool does, when to use it (and when *not* to), and what each parameter means. **This is the single most important factor in tool-selection accuracy** — Claude reads it to decide whether and how to call the tool. Aim for 3–4+ sentences minimum; be prescriptive about *when* to call it, not just what it does.
  - `` `input_schema` `` — a {{JSON Schema|A standard, language-agnostic vocabulary for describing the shape and constraints of JSON data}} object describing the expected arguments.
- An optional `input_examples` array can show Claude concrete valid inputs — useful for complex, nested, or format-sensitive parameters.

> **Gotcha:** A vague description ("Gets the stock price for a ticker.") leaves Claude guessing about triggering conditions and parameter meaning. A good description explains what it does, when to use it, what it returns, and what it *doesn't* return.

```json
{
  "name": "get_weather",
  "description": "Get the current weather for a given location. Use this whenever the user asks about current or forecasted weather conditions for a specific place. Returns temperature, conditions, and wind — it does not return historical weather data.",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City and state, e.g. San Francisco, CA"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "Temperature unit"
      }
    },
    "required": ["location"]
  }
}
```

- `strict: true` on a tool definition (alongside `name`/`description`/`input_schema`) guarantees Claude's `input` always validates against your schema exactly — no missing fields, no type mismatches. Requires `additionalProperties: false` and a `required` list in the schema.
- **Consolidate related operations into fewer, broader tools** (one `manage_pr` tool with an `action` parameter beats separate `create_pr`/`review_pr`/`merge_pr` tools) — fewer tools with clearer boundaries reduce selection ambiguity.

> **Exam tip:** the three tool-definition fields tested by name are `name`, `description`, and `input_schema`. `input_schema` is standard JSON Schema — `type`, `properties`, `required`, `enum`, etc.

---

## `tool_choice`: controlling when and which tool is used

- `tool_choice` is a request-level parameter that constrains *whether* Claude calls a tool and *which* one.

| `tool_choice` value | Behavior |
|---|---|
| `{"type": "auto"}` | Claude decides whether to call any tool. **Default when `tools` is present.** |
| `{"type": "any"}` | Claude **must** call *some* tool, but you don't pick which one. |
| `{"type": "tool", "name": "..."}` | Claude **must** call the *named* tool. |
| `{"type": "none"}` | Claude cannot call any tool at all. **Default when `tools` is absent.** |

```json
{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "tools": [ /* ... */ ],
  "tool_choice": { "type": "tool", "name": "get_weather" },
  "messages": [{ "role": "user", "content": "What's the weather in Paris?" }]
}
```

- Add `"disable_parallel_tool_use": true` to *any* `tool_choice` value to force **at most one** tool call per turn (parallel tool use is otherwise on by default — see below).
- When `tool_choice` is `any` or `tool`, the API effectively prefills the assistant's response to force a tool call — Claude will **not** emit explanatory prose first, even if you ask it to. If you want natural-language commentary *and* a specific tool used, keep `tool_choice: {"type": "auto"}` and steer with an instruction in the user turn instead (e.g. *"Use the `get_weather` tool in your response."*).
- Changing `tool_choice` between requests invalidates the cached **message** blocks (tool definitions and system prompt stay cached).

> **Gotcha:** with **manual** extended thinking (`thinking: {type: "enabled"}`), only `auto` and `none` are supported for `tool_choice` — `any` and a named `tool` return an error. Adaptive thinking (`thinking: {type: "adaptive"}`), including on models where thinking is on by default, *does* support forced tool use.

> **Exam tip:** memorize the four literal `type` values — `auto`, `any`, `tool`, `none` — and that `tool` is the one that takes an extra `name` field to force a *specific* tool.

---

## Parallel vs. sequential tool execution, and error handling

### The full round trip

```mermaid
sequenceDiagram
    participant U as User
    participant C as Claude (API)
    participant A as Your application

    U->>C: Messages request (tools + user message)
    C-->>A: response.stop_reason = "tool_use" (one or more tool_use blocks)
    A->>A: Execute each requested tool
    A->>C: New request: assistant turn + tool_result block(s)
    C-->>A: Final response (stop_reason = "end_turn")
    A-->>U: Answer
```

- In a single turn, Claude's response can contain **multiple `tool_use` blocks** — this is **parallel tool use**, and it is **on by default**. Execute them (concurrently, if independent) and return **all** results together.
- **Formatting rules that the exam loves to test:**
  - All `tool_result` blocks for one assistant turn go into a **single** `user` message — never split across multiple messages.
  - Within that `content` array, every `tool_result` block must come **before** any plain `text` block. Text before a `tool_result` triggers a 400 error.
  - `tool_result` blocks must immediately follow their matching `tool_use` blocks in message history — no other messages in between.
  - Each `tool_result` needs `tool_use_id` matching the original `tool_use.id`, plus `content` (string, or a list of `text`/`image`/`document`/`search_result` blocks) and an optional `is_error`.

> **Gotcha:** returning `tool_result` blocks split across multiple messages, or interleaving other content between a `tool_use` and its `tool_result`, silently trains the model toward *not* calling tools in parallel next time — and can trigger a 400 (`"tool_use ids were found without tool_result blocks immediately after"`).

### Error handling in `tool_result`

- When your tool itself fails (network error, bad input, timeout), return the result with `"is_error": true` and an **informative** message in `content` — not a bare `"failed"`. Claude uses that text to decide whether to retry, try something else, or explain the failure to the user.

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "ConnectionError: weather service unavailable (HTTP 500). Retry after 60 seconds.",
      "is_error": true
    }
  ]
}
```

- **Invalid tool calls** (missing required params) are usually a sign the `description` needs more detail. You can also just return an error `tool_result` — Claude will typically retry 2–3 times with corrections before giving up and explaining to the user.
- **Server tool errors** (e.g. web search rate-limited) are handled transparently by Claude — you never see or set `is_error` for those; Claude gets the error and adapts on its own.
- `strict: true` on the tool definition eliminates the "invalid tool call" failure mode entirely by guaranteeing schema-valid input.

### Manual loop vs. Tool Runner

- **Manual agentic loop**: you write `while stop_reason == "tool_use": execute → send tool_result → repeat` yourself. Full control, no beta dependency.
- **Tool Runner** (SDK beta helper, `client.beta.messages.tool_runner`): the SDK drives the loop, executes your tool functions, and sends results back automatically — recommended default unless you need a control flow the runner's hooks don't cover.
- A response can also carry `stop_reason: "pause_turn"` when a **server-side** tool's internal loop hits its iteration limit — re-send the conversation as-is (don't add an extra "Continue" message) and the server resumes.

> **Exam tip:** "parallel tool execution" on the exam means *Claude requesting several tool calls in one turn*, not your code running them concurrently (though you may). The API-level requirement being tested is almost always "all `tool_result` blocks go in one `user` message, `tool_result` before `text`."

---

## Model Context Protocol (MCP) fundamentals

- {{MCP|Model Context Protocol: an open standard for connecting AI applications to external data sources, tools, and workflows}} is an open-source protocol for connecting AI applications to external systems — think of it as a standard connector so tools/data sources don't need a bespoke integration for every AI app.
- **Three participants**, always in this shape:
  - **MCP host** — the AI application (e.g. Claude Code, Claude Desktop, your own agent) that coordinates one or more MCP clients.
  - **MCP client** — a component, one per server connection, that the host creates to talk to a specific MCP server.
  - **MCP server** — the program that actually exposes tools/data/prompts. Can run locally or remotely.
- **What a server can expose** (the core primitives):
  - **Tools** — executable functions the AI can invoke (file ops, API calls, DB queries).
  - **Resources** — contextual data the AI can read (file contents, DB records, API responses).
  - **Prompts** — reusable interaction templates (system prompts, few-shot examples).
- **Transports** — how client and server actually talk:
  - **stdio** — standard input/output between two local processes on the same machine. No network overhead; typically one client per server.
  - **Streamable HTTP** — HTTP POST plus optional Server-Sent Events for streaming; used for remote servers, supports bearer tokens/API keys/OAuth, and can serve many clients at once.

```mermaid
graph TB
    subgraph "MCP Host (your AI application)"
        C1["MCP Client 1"]
        C2["MCP Client 2"]
    end
    S1["MCP Server A — local<br/>(stdio transport)<br/>e.g. filesystem"]
    S2["MCP Server B — remote<br/>(Streamable HTTP)<br/>e.g. GitHub, Linear"]
    C1 ---|"dedicated connection"| S1
    C2 ---|"dedicated connection"| S2
```

> **Note:** MCP is a **data-layer protocol**, not an opinion about how you use the LLM — it only standardizes how context and actions move between an AI application and external systems.

### Connecting to MCP servers from the Messages API

- Anthropic's **MCP connector** lets you call tools on a **remote** MCP server directly from a Messages API request — no separate MCP client needed. It's a beta feature (header `mcp-client-2025-11-20`) and currently supports **tool calls only** (not resources or prompts), and the server must be reachable over HTTP — local stdio servers can't be connected this way.

```json
{
  "model": "claude-opus-5",
  "max_tokens": 1000,
  "mcp_servers": [
    {
      "type": "url",
      "url": "https://example-server.modelcontextprotocol.io/sse",
      "name": "example-mcp",
      "authorization_token": "YOUR_TOKEN"
    }
  ],
  "tools": [
    { "type": "mcp_toolset", "mcp_server_name": "example-mcp" }
  ],
  "messages": [{ "role": "user", "content": "What tools do you have available?" }]
}
```

- `mcp_servers` declares the connection (URL, name, optional OAuth `authorization_token`); `tools` needs a matching `mcp_toolset` entry (`mcp_server_name` must reference a server you declared) — every declared server must be referenced by exactly one toolset. Per-tool `enabled`/`defer_loading` overrides let you allowlist or denylist individual tools from the server.
- If you need **resources or prompts**, or a **local/stdio** server, you build (or use) a real MCP client — the Anthropic SDKs ship helper functions (`mcp_message`, `mcp_resource_to_content`, etc.) to convert between MCP types and Claude API types when you drive your own MCP client alongside the Anthropic SDK.

### Building a minimal MCP server (Python)

```python
from mcp.server import MCPServer

mcp = MCPServer("weather")

@mcp.tool()
async def get_forecast(latitude: float, longitude: float) -> str:
    """Get weather forecast for a location.

    Args:
        latitude: Latitude of the location
        longitude: Longitude of the location
    """
    # ... fetch and format forecast ...
    return "Sunny, 22°C"

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

- The server declares tools with a decorator; the SDK turns Python type hints and the docstring into the tool's schema and description automatically.
- **stdio servers must never write to stdout** — that corrupts the JSON-RPC message stream. Log via `logging` (which writes to stderr) instead of `print()`. HTTP-based servers don't have this restriction.
- Deploying/connecting: a host (e.g. Claude Desktop) is configured with a command to launch your server (for stdio) or a URL (for Streamable HTTP); it spins up an MCP client that performs capability discovery, then lists and calls your tools as needed.

> **Exam tip:** know the three primitives (tools/resources/prompts), the three participants (host/client/server), and the two transports (stdio for local, Streamable HTTP for remote) — these are the bones of most MCP questions.

---

## Choosing: built-in tools vs. custom tools vs. Skills vs. MCP

| Option | What it is | Reach for it when |
|---|---|---|
| **Built-in (server) tools** | Anthropic-hosted tools you just declare in `tools` — `web_search`, `web_fetch`, `code_execution`, `tool_search`, `computer_use` (self- or Anthropic-hosted), plus Anthropic-*schema* client tools `bash`, `text_editor`, `memory` | The capability is generic and Anthropic already built it well — web search/fetch, sandboxed code execution, GUI/computer control, file/shell operations. Zero or minimal integration code. |
| **Custom tools** | You write `name`/`description`/`input_schema` and the handler code in your app | The action is specific to *your* system — your database, your internal API, your business logic. You own execution and can gate/audit/rate-limit it. |
| **Skills** | A packaged folder (`SKILL.md` + optional scripts/resources) of instructions and know-how that Claude loads *progressively* — metadata always in context, full instructions only when triggered | You want to give Claude *procedural knowledge* — house style, a multi-step workflow, domain expertise — reusable across many conversations, without paying full context cost every turn. Complements tools; it's knowledge, not an action. |
| **MCP (server / connector)** | An external, standardized server exposing tools/resources/prompts over stdio or HTTP, usable from many different AI applications, not just your one codebase | You need to connect to **third-party or shared infrastructure** (GitHub, Slack, a company-wide data source) or want one integration reusable across multiple apps/agents instead of hand-rolling a custom tool per app. |

- **Built-in vs. custom**: ask "did Anthropic already solve this generic problem?" — search, fetch, sandboxed execution, computer control. If yes, use the built-in tool; you skip writing and hosting the execution logic.
- **Custom tool vs. MCP server**: a custom tool is the right choice when only *your* application needs the action. Once **multiple applications or teams** need the same integration (e.g. "talk to our ticketing system"), pulling it out into an MCP server means you write the integration once and any MCP-compatible host can use it — this is the main reason MCP exists.
- **Skills vs. tools**: a tool is an *action* (a function Claude can call); a Skill is *knowledge* (instructions Claude reads and follows, often orchestrating several tool calls along the way). Skills and tools are complementary, not competitors — a Skill's instructions frequently tell Claude which tools to use and how.
- **Skills vs. MCP**: a Skill packages instructions that live in *your* environment (or ship with the model surface, e.g. Claude Code); an MCP server exposes *capabilities* over a network protocol that any compliant client can consume. If the goal is "share this integration across totally different applications," that's MCP; if it's "teach Claude how to do this specific task well," that's a Skill.

> **Exam tip:** the blueprint phrase is "choosing built-in tools vs. custom tools vs. Skills vs. MCP" — expect a scenario question ("your team wants every internal agent, regardless of framework, to be able to query the same internal wiki — what do you build?") where the answer is MCP specifically *because* of reuse across independent applications, not because of any technical capability a custom tool couldn't also provide.

### Further reading

- [Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) — tool definitions, client vs. server tools, pricing
- [Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) — `tool_choice` modes, best practices for descriptions, forcing tool use
- [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) — `tool_result` formatting rules and `is_error` error handling
- [MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector) — calling remote MCP servers directly from the Messages API
- [Model Context Protocol — architecture overview](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture) — hosts/clients/servers, primitives, transports
- [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — SKILL.md format and progressive disclosure
