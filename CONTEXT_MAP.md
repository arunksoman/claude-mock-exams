# Claude Certification Question Bank — Context Map

Reference doc for this project's state, design decisions, and how the pieces fit
together. Read this first when picking the work back up.

## Purpose

A local practice-question bank for the **Claude Certified Developer Foundation
(CCDV-F)** exam: 1060 MCQ questions with full per-choice reasoning, stored in a
SQLite/libSQL (Turso-compatible) database. Schema is designed to support
additional certifications later and a future practice/quiz UI — neither of
those is built yet, only the data layer.

## Repository layout

```
claude_certification/
├── .env                    # TURSO_URL / TURSO_TOKEN for the cloud-hosted copy (secret — not in db design)
├── db/
│   ├── schema.sql           # authoritative schema definition
│   └── claude-mock-exams.db # the built SQLite/libSQL database file (renamed from claude_certs.db)
├── data/ccdv-f/
│   ├── _certification.json  # cert manifest: metadata + 8 domain definitions (weights, codes, names)
│   └── *.jsonl               # 151 files, 1060 question objects total — AUTHORITATIVE content source
└── scripts/
    ├── import.py             # builds/rebuilds the db from data/ccdv-f/*.jsonl
    ├── markdownify.py        # adds backtick code-span formatting to question/choice text, in place
    └── rebalance_difficulty.py  # redistributes difficulty labels directly in the db (not the JSONL)
```

**The JSONL files under `data/ccdv-f/` are the source of truth.** The database
is a derived build artifact — dropping and re-running `import.py` regenerates
it from source at any time. Anything that isn't reflected in the JSONL (e.g.
difficulty rebalancing, see below) will be lost on a fresh import and must be
re-applied.

`.env` holds credentials for a Turso Cloud database named `claude-mock-exams`
at `libsql://claude-mock-exams-arunksoman.aws-ap-south-1.turso.io`, for
syncing/hosting this data remotely later. Not yet wired into any script here.

## Database design

Normalized, multi-certification-ready schema (`db/schema.sql`):

- **`certifications`** — one row per cert track (code, name, vendor, exam
  metadata: question count, duration, passing score). Only `CCDV-F` exists
  now; adding another cert is just another row plus its own `domains`/
  `questions`.
- **`domains`** — exam blueprint domains within a cert, with real exam
  `weight_percentage` (drives proportional practice-exam generation later).
  Unique per `(certification_id, code)`.
- **`topics`** — optional finer grouping within a domain (e.g. "Streaming",
  "Prompt caching"). Nullable on questions, adopted incrementally.
- **`tags`** / **`question_tags`** — free-form cross-cutting labels for
  search/filtering, independent of the domain/topic hierarchy.
- **`questions`** — `question_type` (`single_choice` / `multiple_response` /
  `true_false`), `difficulty` (`easy`/`medium`/`intermediate`/`difficult`),
  `stem`, `select_count` (how many choices must be picked), `explanation`,
  `reference`, `status` (`draft`/`published`/`retired`), `external_key`
  (stable id like `ccdvf-ai-0142`).
- **`choices`** — `label` (choice text), `is_correct`, and **`reasoning`
  (`NOT NULL`) — every choice, right or wrong, carries its own explanation,
  not just the correct one.
- **`practice_sessions`** / **`practice_session_items`** — forward-looking
  tables for a future quiz UI (timed exams, review-mistakes mode, per-item
  selected choices, flags, timing). `user_label` is free text since there's
  no auth system — swapping in a real `user_id` later is a non-breaking
  column addition.
- **`v_question_summary`** view — per-question `choice_count` /
  `correct_choice_count`, used by the importer (and future UI) to sanity-check
  `select_count` against actual choice data.

Indexes cover the obvious filter/join paths: cert, domain, difficulty,
question type, question_id on choices, tag_id, session_id.

## Content summary

- **1060 questions / 4240 choices**, 0 orphan choices, 0 select-count
  mismatches (verified via `v_question_summary`).
- **Domain distribution** — proportional to the real CCDV-F exam blueprint
  weights (not evenly split):

  | Domain                         | Weight | Questions |
  | ------------------------------ | ------ | --------- |
  | Applications & Integration     | 33.1%  | ~350      |
  | Model Selection & Optimization | 16.8%  | ~178      |
  | Agents & Workflows             | 14.7%  | ~156      |
  | Prompt & Context Engineering   | 11.0%  | ~117      |
  | Tools & MCPs                   | 10.6%  | ~112      |
  | Security & Safety              | 8.1%   | ~86       |
  | Claude Code                    | 3.1%   | ~33       |
  | Eval, Testing & Debugging      | 2.6%   | ~32       |

- **Difficulty distribution** (after rebalancing): medium 451, intermediate
  319, difficult 212, easy 78. Originally generation skewed ~83% medium;
  `scripts/rebalance_difficulty.py` relabels a deterministic per-domain
  10-slot pattern (5 medium / 3 intermediate / 2 difficult) directly on the
  db. **This script must be re-run after every fresh `import.py` run**, since
  the JSONL source still has the original (medium-heavy) difficulty labels.
- **Question types**: mix of `single_choice` and `multiple_response`
  (choose-N), matching the real exam's format.
- **Markdown formatting**: `stem`, `explanation`, choice `label`/`reasoning`
  fields use backtick code-spans for API identifiers, parameter names, and
  code/JSON snippets (e.g. `` `tool_choice` ``, `` `messages` ``,
  `` `tool_choice: {"type": "auto"}` ``). Applied by `scripts/markdownify.py`
  directly to the JSONL source (so it survives re-imports), using
  boundary-aware rules that specifically avoid corrupting contractions and
  possessives (isn't, don't, model's, etc.).

## Rebuild procedure

```
python scripts/markdownify.py           # only needed if editing question text — safe to re-run, idempotent
python scripts/import.py data/ccdv-f --db db/claude-mock-exams.db --schema db/schema.sql
python scripts/rebalance_difficulty.py  # re-apply difficulty relabeling after any fresh import
```

## Known gaps / not yet built

- No UI (explicitly out of scope for now — schema anticipates one via
  `practice_sessions`/`practice_session_items`).
- No sync to the Turso Cloud instance referenced in `.env` — local db file
  only.
- Difficulty rebalancing lives only in the db, not the JSONL source (see
  above) — a source-level fix would fold it into generation instead.
