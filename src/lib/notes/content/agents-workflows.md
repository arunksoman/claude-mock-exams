## Workflows vs. agents — the decision criteria

The canonical source for this whole domain is Anthropic's engineering post **["Building Effective Agents"](https://www.anthropic.com/engineering/building-effective-agents)**. Its central distinction shows up repeatedly on the exam.

- {{Workflow|A system where LLMs and tools are orchestrated through predefined code paths}} — **fixed control flow written by you**. The sequence of steps, branches, and tool calls is decided in advance, in code.
  - Predictable, consistent, easy to test and debug.
  - Right for well-defined tasks where the steps are known ahead of time.
- {{Agent|A system where the LLM dynamically directs its own process and tool usage, maintaining control over how it accomplishes a task}} — **model-directed control flow**. The LLM decides at runtime which tools to call, in what order, and when it's done.
  - More flexible and can handle open-ended, unpredictable tasks.
  - Costs more latency and tokens, and is harder to predict/debug than a workflow.
- **Decision rule:** if you can draw the flowchart in advance, build a workflow. If the number and order of steps genuinely depends on what the model discovers along the way, you need an agent.
- Anthropic's own advice is to **start simpler than either**: a single well-optimized LLM call (with good retrieval and in-context examples) often suffices. Only add workflow/agent complexity when a simple call demonstrably falls short.

> **Exam tip:** the blueprint phrase "predictable multi-step pipeline with fixed control flow = workflow; open-ended, model-directed control flow = agent" is close to a direct quote from the source post — expect a question that just asks you to classify a scenario as one or the other.

### The augmented LLM — the shared building block

- Both workflows and agents are built from the same primitive: an **augmented LLM** — a model enhanced with retrieval, tools, and memory.
- Modern Claude models can generate their own search queries, pick appropriate tools, and decide what to retain — this capability is what makes agents viable at all.
- Design principle either way: give the model a **clear, minimal interface** to its capabilities (well-documented tools, not a kitchen sink) rather than maximizing the number of things it *could* do.

> **Gotcha:** "agent" in casual conversation often just means "a chatbot that uses tools." On the exam, hold the stricter distinction — a single LLM call with tool access that always follows the same fixed sequence is still a *workflow*, not an agent, because the control flow is fixed rather than model-directed.

---

## The tool-use loop mechanics

Whether you're inside a workflow step or a fully autonomous agent, the mechanical unit underneath is the **tool-use loop**: the model asks for a tool, your code runs it, you hand the result back, repeat.

- The model emits a `stop_reason: "tool_use"` response containing one or more {{tool_use|A content block the model emits requesting a specific tool call, with a name, input, and a unique id}} blocks.
- **Your application code** — not the model — actually executes the tool (calls an API, runs a shell command, queries a database).
- You return the outcome as a `tool_result` content block, matched to the request via `tool_use_id`, inside a new `user` message.
- The full loop repeats — the model may call more tools, or it may finish with `stop_reason: "end_turn"`.
- **Multiple tool calls in one turn** are common (parallel tool use) — execute them concurrently and return *all* results together in a single message; splitting them across messages teaches the model to stop batching calls.
- Always append the model's **full** response content (not just the text) back into conversation history — dropping intermediate blocks (like thinking or tool_use blocks) breaks the next turn.

```mermaid
flowchart TD
    A["Send request to model\n(messages + tools)"] --> B{"stop_reason?"}
    B -- "tool_use" --> C["Execute tool(s) in your code"]
    C --> D["Append tool_result block(s)\nto conversation"]
    D --> A
    B -- "end_turn" --> E["Return final answer to caller"]
    B -- "max_tokens / other" --> F["Handle truncation or error"]
```

- This loop is what the **Claude Agent SDK**, the **API's tool runner helper**, and any **hand-rolled loop** all implement underneath — they differ in who writes the loop and what's automated around it (see next section).

> **Exam tip:** the stopping condition for the loop is `stop_reason != "tool_use"` — usually `end_turn`. A loop that only checks "did the model call a tool" and never checks a max-iteration guard is a classic runaway-agent bug.

---

## The Claude Agent SDK vs. building your own loop

### What the Claude Agent SDK gives you out of the box

The **[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)** packages the same harness that powers Claude Code as a library (Python and TypeScript) — you get the agent loop *and* a batteries-included environment around it, not just raw API access.

- **Built-in tools** — file read/write/edit, bash execution, web search — ready to use with no implementation work.
- **The agent loop itself** — planning, calling tools, deciding when a task is done — is handled for you; you don't write the `while` loop.
- **Automatic context management** — the SDK compacts the conversation as it fills, so long-running tasks don't simply run out of context (see Memory & compaction below).
- **Permissions** — fine-grained control over which tools run automatically vs. require approval.
- **Sub-agents** — spawn specialized agents for focused subtasks (own section below).
- **MCP support** — connect external tools/data sources via the Model Context Protocol.
- **Sessions** — maintain context across exchanges; resume or fork a conversation later.
- **Skills, hooks, slash commands, plugins** — the same extensibility surface as Claude Code itself, loaded from `.claude/` directories.

```python
from claude_agent_sdk import query, ClaudeAgentOptions

async for message in query(
    prompt="Find and fix the bug in the auth module",
    options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash", "Grep"]),
):
    if hasattr(message, "result"):
        print(message.result)
```

> **Note:** the Agent SDK is a distinct product from the plain Anthropic API's `tool_runner` helper. The `tool_runner` (`client.beta.messages.tool_runner`) automates the request→execute→loop cycle for *tools you define yourself* — no built-in file/bash tools, no context compaction, no sandbox. The Agent SDK is the full Claude Code harness with built-in tools included. Both still leave *deployment* (hosting, infra) to you.

### Building a custom agent loop by hand

If you're not using the SDK — calling the raw Messages API and driving the loop yourself — you own everything the SDK would otherwise give you:

- **The loop control flow** — repeatedly call the API, inspect `stop_reason`, execute tools, append results, resend.
- **Stopping conditions** — not just `end_turn`, but a **max-iteration / max-turns cap** to prevent infinite loops (a model can get stuck re-calling a failing tool), and often a token or cost budget.
- **Error handling** — a failed tool call should come back as a `tool_result` with `is_error: true` so the model can adapt, not silently drop the turn or crash the process.
- **State/history management** — you must persist and correctly append the full conversation, including tool_use/tool_result pairing, across turns yourself.
- **Context management** — nothing compacts automatically; you decide when and how to summarize or prune (see next section).
- **Permissions/approval gates** — if a tool is destructive, you write the human-in-the-loop confirmation step.

```python
# Minimal custom agent loop (pseudocode)
messages = [{"role": "user", "content": user_input}]
MAX_ITERATIONS = 10

for i in range(MAX_ITERATIONS):
    response = client.messages.create(
        model="claude-opus-5", max_tokens=4096,
        tools=tools, messages=messages,
    )
    messages.append({"role": "assistant", "content": response.content})

    if response.stop_reason != "tool_use":
        break  # end_turn, or something else to handle explicitly

    tool_results = []
    for block in response.content:
        if block.type == "tool_use":
            try:
                result = execute_tool(block.name, block.input)
                tool_results.append({"type": "tool_result",
                                      "tool_use_id": block.id, "content": result})
            except Exception as e:
                tool_results.append({"type": "tool_result",
                                      "tool_use_id": block.id,
                                      "content": str(e), "is_error": True})
    messages.append({"role": "user", "content": tool_results})
else:
    raise RuntimeError("Agent did not finish within MAX_ITERATIONS")
```

> **Exam tip:** "what must you implement yourself if not using the SDK/tool runner?" → the loop, the stopping condition(s), error handling for failed tool calls, and context/state management. The SDK's main value-add over the raw loop is exactly these pieces being handled for you, plus built-in tools.

---

## Sub-agents

- A **sub-agent** is a separate agent instance the main agent spawns to handle a focused subtask, then returns a summary to the parent.
- **Why delegate to a sub-agent:**
  - **Context isolation** — the sub-agent runs in its own fresh context window. Intermediate tool calls and exploration (e.g. reading dozens of files) stay inside the sub-agent; only its *final* condensed message returns to the parent. This keeps the parent's context small.
  - **Parallelization** — independent sub-agents can run concurrently, so total time is bounded by the slowest one, not the sum of all of them.
  - **Specialization** — each sub-agent can carry its own system prompt with narrow expertise (e.g. a `database-migration` agent that knows rollback strategies the main agent doesn't need cluttering its own prompt).
  - **Tool restriction / least privilege** — a sub-agent can be limited to a safe subset of tools (e.g. `Read`, `Grep`, `Glob` only), reducing the blast radius of an unintended action.
- **What a sub-agent inherits:** its own system prompt plus the exact prompt/instructions the parent hands it. It does **not** inherit the parent's conversation history or tool results — anything it needs (file paths, prior decisions, error messages) must be passed explicitly in the delegation prompt.
- **What comes back:** only the sub-agent's final message returns to the parent as the tool result — not its full transcript. This is the mechanism that keeps parent context small.
- Sub-agents can be defined **programmatically** (in code, via an `AgentDefinition`-style object with `description`, `prompt`, `tools`, `model`) or **as filesystem-based markdown files** (e.g. `.claude/agents/*.md`). A built-in general-purpose sub-agent is also available without defining anything.
- The model decides *when* to invoke a sub-agent based on its `description` field — write descriptions that clearly state when to use it, the same way you'd write a good tool description.

```mermaid
sequenceDiagram
    participant U as User
    participant M as Main agent
    participant S as Sub-agent (fresh context)

    U->>M: "Review the auth module for security issues"
    M->>S: Spawn sub-agent with task + minimal needed context
    activate S
    S->>S: Reads files, runs greps, reasons (isolated context)
    S-->>M: Condensed summary only
    deactivate S
    M->>U: Synthesized final answer
```

> **Exam tip:** the reason sub-agents scale better than one long agent conversation is **context isolation** — detailed exploration doesn't bloat the parent's window. This is the same idea Anthropic's context-engineering post calls "separation of concerns."

---

## Memory & context compaction

Long-running agents accumulate tool results, reasoning, and turns until they threaten to exceed the context window — and even before hitting the limit, a bloated context degrades response quality. Anthropic's engineering post **["Effective context engineering for AI agents"](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)** frames the core principle simply: at every step, find *the smallest set of high-signal tokens that maximizes the likelihood of the desired outcome*.

Three complementary techniques:

- **Compaction** — summarize a conversation nearing its context limit and reinitialize a new context window seeded with that summary.
  - Keep architectural decisions and unresolved issues; discard redundant tool output.
  - Start by maximizing recall (capture everything that might matter), then refine down.
  - Clearing old tool results is a lightweight first step before full summarization.
  - The Claude Agent SDK does this **automatically** as the window fills — you don't write summarization code yourself. The plain Messages API also offers this as a (beta) server-side feature.
- **Structured note-taking / external memory** — the agent writes persistent notes (e.g. a `NOTES.md` or to-do list) *outside* the context window and reads them back later.
  - Lets an agent track progress across a task that spans multiple context resets, without paying the token cost of keeping everything in-window.
- **Sub-agent architectures** — as above: push detailed exploration into a sub-agent with a clean context window, and only pull back a condensed (roughly 1,000–2,000 token) summary. This is itself a context-management strategy, not just a delegation one.

> **Gotcha:** compaction summarizes/replaces context; it is a distinct concept from **context editing**, which *clears* stale tool results or thinking blocks without summarizing them. Don't conflate the two if a question asks specifically which technique "discards" vs. "summarizes."

> **Exam tip:** if a question describes an agent that "runs for hours" or "exceeds the context window," the expected answer touches compaction, note-taking to external memory, and/or delegating to sub-agents with isolated context — not simply "use a bigger context window."

---

## Orchestration patterns

Anthropic's "Building Effective Agents" post names five recurring workflow/agent patterns. Know the shape of each and when it applies — this is dense exam material.

| Pattern | Structure | When to use |
|---|---|---|
| **Prompt chaining** | Sequential LLM calls; each step's output feeds the next; optional programmatic "gate" checks between steps | Task decomposes cleanly into fixed subtasks; trading latency for higher accuracy is acceptable |
| **Routing** | Classify the input first, then send it down one of several specialized downstream paths | Distinct input categories that are each handled better by a dedicated prompt/model |
| **Parallelization** | *Sectioning* — independent subtasks run simultaneously; or *Voting* — the same task run multiple times for diverse outputs | Speed (sectioning), or higher confidence via multiple independent perspectives (voting) |
| **Orchestrator-workers** | A central orchestrator LLM breaks a task down dynamically and delegates pieces to worker LLMs, then synthesizes their results | Subtasks can't be predetermined — the decomposition itself depends on what's discovered |
| **Evaluator-optimizer** | One LLM generates a response; a second LLM evaluates it and gives feedback; loop until the evaluator is satisfied | Clear evaluation criteria exist and iterative refinement measurably improves output |

- **Prompt chaining** example: generate marketing copy, then translate it; or draft an outline, then write from it.
- **Routing** example: send simple customer-service queries to a cheap/fast model, complex ones to a more capable model.
- **Parallelization** example: run guardrail screening and response generation simultaneously (sectioning); have several independent code reviewers flag vulnerabilities and combine findings (voting).
- **Orchestrator-workers** example: a multi-file coding change where the set of files to touch isn't known until the orchestrator investigates.
- **Evaluator-optimizer** example: iterative literary translation, refined against feedback each round.

```mermaid
flowchart TD
    T["Incoming task"] --> O["Orchestrator LLM\n(plans & delegates)"]
    O --> W1["Worker LLM 1"]
    O --> W2["Worker LLM 2"]
    O --> W3["Worker LLM N"]
    W1 --> S["Orchestrator synthesizes results"]
    W2 --> S
    W3 --> S
    S --> R["Final output"]
```

> **Exam tip:** orchestrator-workers is the pattern most often confused with routing — the distinguishing factor is that in routing, exactly **one** path is chosen up front and executed; in orchestrator-workers, the orchestrator dynamically decides the **decomposition itself** (potentially many workers, decided at runtime) and then combines their outputs. Also note orchestrator-workers is the closest workflow pattern to a true "agent" — the exam may test that it sits on the workflow→agent spectrum.

> **Gotcha:** all five patterns are *workflow* patterns (fixed code paths orchestrating LLM calls) in Anthropic's own framing — even orchestrator-workers, despite superficially resembling an agent, is still typically implemented with an orchestrator loop that has a bounded, code-defined structure rather than fully open-ended model control.

### Further reading

- [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — the canonical source for workflows vs. agents and the five orchestration patterns
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — compaction, structured note-taking, and sub-agent strategies for long-running agents
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — what the Claude Agent SDK provides (built-in tools, context management, permissions, sessions, sub-agents)
- [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents) — how to define, invoke, and restrict sub-agents; context-isolation details
- [Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) — the tool-use loop, tool definitions, and handling tool results
- [Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction) — server-side automatic context compaction on the Messages API
