## Scope of this domain

Covers configuring and operating Claude Code itself as a production tool:
the CLAUDE.md/settings hierarchy, hooks and permissions as enforcement,
skills and slash commands, plan mode vs. direct execution, session
management, and wiring Claude Code into CI/CD. At 20% this ties with Prompt
Engineering & Structured Output for second-largest domain.

> **Exam tip:** the Developer Productivity with Claude and Claude Code for
> Continuous Integration scenario banks both draw heavily on this domain —
> if only one of your four exam scenarios is going to be Claude-Code-heavy,
> it's usually one of these two.

## CLAUDE.md hierarchy — the most commonly mis-tested fact in this domain

| Location                        | Scope                                    | Shared with team?            |
| ------------------------------- | ---------------------------------------- | ---------------------------- |
| `~/.claude/CLAUDE.md`           | User-global, applies across all projects | **No** — personal only       |
| `.claude/CLAUDE.md` (repo root) | Project-level                            | **Yes** — version-controlled |
| `some/subdir/CLAUDE.md`         | Scoped to that subdirectory              | Yes, if committed            |

> **Gotcha:** `~/.claude/CLAUDE.md` is **user-only, never team-shared** —
> this is the single most repeated trap in this domain. A question that
> implies "put the team convention in your personal `~/.claude/CLAUDE.md`
> and your teammates will pick it up" is testing whether you know that
> doesn't propagate. Team conventions belong in the project-level
> `.claude/CLAUDE.md`, committed to version control.

- Use `@import` syntax to modularize a large CLAUDE.md instead of one long
  file.
- **`.claude/rules/`** (YAML frontmatter with a `paths` glob field) handles
  multi-directory, path-specific conventions more precisely than scattering
  subdirectory CLAUDE.md files — reach for it when a rule should apply to
  `src/api/**` but not `src/ui/**`, for example.

### CLAUDE.md vs. auto-memory — different things

- **CLAUDE.md**: persistent context _you_ author — build commands,
  conventions, architecture notes, known gotchas.
- **Auto-memory**: context Claude _itself_ maintains across a session or
  project — discovered commands, debugging insights it picked up along the
  way.
- **Neither is enforcement.** Both are context the model reads and may or
  may not perfectly follow. A "must never happen" rule (e.g. "never commit
  `.env`") belongs in a hook or a `permissions.deny` rule, not just prose in
  CLAUDE.md.

## Skills, slash commands, and scoping

| Artifact       | Personal location     | Team location                    |
| -------------- | --------------------- | -------------------------------- |
| Slash commands | `~/.claude/commands/` | `.claude/commands/` (VCS-shared) |
| Skills         | —                     | `.claude/skills/` (VCS-shared)   |

- Skill frontmatter: `context: fork` runs the skill in an **isolated
  subagent** — its output doesn't pollute the main conversation's context
  window. `allowed-tools` restricts exactly which tools that skill may use,
  narrowing its blast radius the same way tool distribution narrows a
  subagent's role in the Agentic Architecture domain.

## Plan mode vs. direct execution

| Use plan mode when...                                 | Use direct execution when...       |
| ----------------------------------------------------- | ---------------------------------- |
| Change spans multiple files or subsystems             | Change is a single, localized file |
| Multiple valid architectural approaches exist         | Fix is obvious from a stack trace  |
| A migration or other hard-to-reverse step is involved | Change is small and low-risk       |
| You want read-only exploration before any edit        | —                                  |

> **Gotcha:** plan mode is **not** the same thing as extended thinking.
> Plan mode is a workflow mode (explore and propose before executing);
> extended thinking is a reasoning-budget setting for working through a hard
> problem. A question conflating the two is testing this exact distinction.

## Permissions and hooks as enforcement

- `settings.json` **`permissions.deny`** rules are the enforced boundary —
  use them for anything that must never happen (destructive commands,
  touching secrets files), not a CLAUDE.md instruction asking nicely.
- Hooks (`PreToolUse`, `PostToolUse`, etc.) can block or transform tool calls
  programmatically — same enforcement-over-guidance principle that runs
  through the whole exam (see the [overview](/notes/ccar-f)'s core mental
  model, and Agentic Architecture's hooks section).

## Built-in tool selection

| Tool                 | Use for                                                  |
| -------------------- | -------------------------------------------------------- |
| `Grep`               | Search file **contents** for a pattern                   |
| `Glob`               | Find files by **path pattern**                           |
| `Read`               | Read a **known** file                                    |
| `Edit` / `MultiEdit` | Targeted, surgical modifications via unique matched text |
| `Write`              | Full file replacement, or new file creation              |
| `Bash`               | Run tests, scripts, build commands                       |
| `Task` (subagent)    | Delegate open-ended exploration to an isolated context   |

> **Exam tip:** the canonical exploration order is **grep for the
> identifier → read the entry file(s) it's in → follow imports/references →
> trace execution paths → summarize findings once the trail gets long.**
> Reading every file upfront "to be thorough" is a wrong-answer pattern —
> it burns context for no benefit when a targeted grep would find the same
> thing faster and cheaper.

- Prefer `Edit` over `Write` when only part of a file changes — `Write`
  (full replacement) is the fallback for when a precise `Edit` match isn't
  available, not the default.

## Sessions and resumption

| Flag                  | Behavior                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| `--continue`          | Resume the **most recent** session — only correct if that's actually the one you want |
| `--resume` / `-r`     | Open a picker to choose a **specific** session                                        |
| `--session-id <UUID>` | Attach to a stable, programmatically-chosen session id                                |
| `--fork-session`      | Branch a **new** session from an existing one, leaving the original untouched         |

> **Gotcha:** resuming the **same session from multiple terminals
> simultaneously** is a known footgun — the two processes race on the same
> session state. If a scenario needs two divergent explorations from a
> shared starting point, `--fork-session` is the correct tool, not two
> terminals pointed at one `--continue`.

## CI/CD integration

- Run Claude Code **non-interactively** with `-p` (or `--print`) for
  pipeline use — no interactive prompt loop.
- Add `--output-format json` plus `--json-schema` to get structured,
  parseable output for something like an automated PR comment, rather than
  scraping free-form text.
- **Disable model history** when Claude Code reviews its own generated code
  in a pipeline step, so the review pass isn't biased by seeing its own
  prior reasoning as established fact.

```bash
# Non-interactive CI usage: structured JSON output for a PR-comment bot
claude -p "Review this diff for correctness issues" \
  --output-format json --json-schema review_schema.json
```

## Scratchpad pattern for long exploration

- For a long-running investigation (large codebase, multi-step migration),
  maintain a scratchpad file recording: key findings, the data flow as
  understood so far, open questions, risk areas, and next steps.
- Use `/compact` to reduce context during an extended session, and export
  state to a manifest file so work survives a crash or a session restart —
  the same "structured export, not raw transcript" principle as Agentic
  Architecture's state-persistence guidance.

## Scenario spotlight: Claude Code for CI and Developer Productivity

Expect these two scenario banks to test: `-p`/`--output-format json` for
non-interactive pipeline use, CLAUDE.md hierarchy (especially the
user-vs-team trap above), plan mode vs. direct execution triggers, and
session-resumption flag selection for a stated workflow (e.g. "two engineers
need to explore different fixes for the same bug starting from the same
context" → `--fork-session`, not `--continue` twice).

### Further reading

- [Claude Code overview](https://code.claude.com/docs/en/overview) — what Claude Code is, install methods, surfaces, and workflow integrations.
- [How Claude remembers your project](https://code.claude.com/docs/en/memory) — full `CLAUDE.md` hierarchy, `.claude/rules/`, imports, and auto memory.
- [Extend Claude with skills](https://code.claude.com/docs/en/skills) — `SKILL.md` structure, frontmatter reference, `context: fork`, `allowed-tools`.
- [Slash commands reference](https://code.claude.com/docs/en/commands) — the full built-in command list and custom-command locations.
- [CLI reference](https://code.claude.com/docs/en/cli-reference) — every flag, session management (`--continue`, `--resume`, `--fork-session`), output formats, scripting.
- [Settings](https://code.claude.com/docs/en/settings) — `settings.json` fields, `permissions.deny`, file locations, precedence.
