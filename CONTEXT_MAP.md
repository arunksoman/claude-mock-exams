# Claude Certification Question Bank — Context Map

Reference doc for this project's state, design decisions, and how the pieces fit
together. Read this first when picking the work back up.

## Purpose

A practice-exam web app for the **Claude Certified Developer Foundation
(CCDV-F)** exam: 1060 MCQ questions with full per-choice reasoning, stored in a
SQLite/libSQL (Turso-compatible) database, served by a SvelteKit UI (practice
mode, timed mock exams, history/review) deployed on Vercel. Schema is designed
to support additional certifications later, though only CCDV-F content exists
now.

Live at: `claude-mock-exams-eight.vercel.app`.

## Repository layout

```
claude_certification/
├── .env                    # TURSO_URL / TURSO_TOKEN — the app's only data source at runtime (secret)
├── db/
│   ├── schema.sql           # authoritative schema definition
│   └── claude-mock-exams.db # the built SQLite/libSQL database file
├── data/ccdv-f/
│   ├── _certification.json  # cert manifest: metadata + 8 domain definitions (weights, codes, names)
│   └── *.jsonl               # 151 files, 1060 question objects total — AUTHORITATIVE content source
├── scripts/
│   ├── import.py             # builds/rebuilds the db from data/ccdv-f/*.jsonl
│   ├── markdownify.py        # adds backtick code-span formatting to question/choice text, in place
│   └── rebalance_difficulty.py  # redistributes difficulty labels directly in the db (not the JSONL)
├── src/
│   ├── routes/               # pages: /, /practice, /practice/session, /exam, /exam/active, /history, /history/[id]
│   │                          # + api/practice/start, api/exam/start, api/exam/submit (+server.ts endpoints)
│   └── lib/
│       ├── components/       # ChoicePicker, ChoiceReview, ScoreBreakdown, Timer, QuestionNav, Markdown, FullscreenToggle, ...
│       ├── state/             # theme/practice/exam/history .svelte.ts — runed client state, persisted to localStorage
│       ├── storage/            # localStorage.ts — versioned key read/write + clearAllAppData()
│       ├── server/             # db.ts (libSQL client + cheap cert/domain cache), queries.ts, examSampler.ts, markdown.ts
│       ├── scoring.ts           # grading logic (buildGradedQuestion, domain/overall score breakdowns) — universal, not server-only
│       └── shuffle.ts            # shuffle() + shuffleQuestionChoices() — used by both api/practice/start and api/exam/start
├── vite.config.ts            # SvelteKit + adapter-auto (see Deployment)
└── package.json               # pnpm workspace; see Deployment for the htmlparser2 override
```

**The JSONL files under `data/ccdv-f/` are the source of truth for question
content.** The database is a derived build artifact — dropping and re-running
`import.py` regenerates it from source at any time. Anything that isn't
reflected in the JSONL (e.g. difficulty rebalancing, see below) will be lost on
a fresh import and must be re-applied.

`.env` holds credentials for a Turso Cloud database named `claude-mock-exams`
at `libsql://claude-mock-exams-arunksoman.aws-ap-south-1.turso.io`. **This is
the app's only data source at runtime** — `src/lib/server/db.ts` connects to
it via `@libsql/client` and nothing in `src/` ever reads the local
`db/claude-mock-exams.db` file (that file only matters for the local rebuild
tooling below). Keeping the local db and Turso Cloud in sync after a rebuild
is a manual step — see Known gaps.

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
- **`practice_sessions`** / **`practice_session_items`** — tables for
  session/attempt tracking (timed exams, review-mistakes mode, per-item
  selected choices, flags, timing). Currently unused by the app — the SvelteKit
  UI persists in-progress and completed attempts to **localStorage** instead
  (`src/lib/state/*.svelte.ts`), not these tables. `user_label` is free text
  since there's no auth system.
- **`v_question_summary`** view — per-question `choice_count` /
  `correct_choice_count`, used by the importer to sanity-check `select_count`
  against actual choice data.

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
- **Answer-length balance**: originally, the correct choice was the single
  longest option in 95.6% of questions (avg. 179.5 chars vs 85.5 for wrong
  choices) — a severe "pick the longest answer" tell that made the bank
  unusable for real practice. Fixed in two content passes (done via parallel
  subagents reading/editing each question, not a mechanical script, since
  naive regex risked deleting real content): (1) trimmed each correct choice's
  redundant trailing justification clause (the "why" already lives in
  `reasoning`/`explanation`), (2) expanded ~1,500 blunt one-line wrong choices
  into comparably detailed (but still wrong, per their own `reasoning`)
  options. Also softened distractors that relied solely on absolutist words
  ("always"/"never"/"entirely") as their only tell, where `reasoning` didn't
  specifically hinge on refuting that framing. Result: correct-choice-is-
  longest dropped to 28.6% (≈25% random baseline for 4 choices), with no
  inverse "shortest = correct" tell introduced (22.8%, also near baseline).
  This was a one-time content edit to the JSONL source; no script reproduces
  it — if new questions are added by hand later, watch for the same pattern.

## Rebuild procedure

```
python scripts/markdownify.py           # only needed if editing question text — safe to re-run, idempotent
python scripts/import.py data/ccdv-f --db db/claude-mock-exams.db --schema db/schema.sql
python scripts/rebalance_difficulty.py  # re-apply difficulty relabeling after any fresh import
```

## Frontend (SvelteKit)

- **Stack**: SvelteKit 2 / Svelte 5 (runes mode), Vite 8, TypeScript, pnpm.
  `@libsql/client` reads `db/claude-mock-exams.db` server-side
  (`src/lib/server/db.ts`, `queries.ts`); `marked` + `sanitize-html` render
  question/choice markdown to sanitized HTML (`src/lib/components/Markdown.svelte`).
- **Modes**: `/practice` (untimed, domain/difficulty filters, reveal-as-you-go)
  and `/exam` → `/exam/active` (timed 53-question mock exam matching the real
  exam's shape, flagging, question nav grid, fullscreen). Both write completed
  attempts to `/history`, backed by localStorage (`src/lib/state/`), not the
  db's `practice_sessions` tables.
- **Practice-mode answer flow** (`src/routes/practice/session/+page.svelte`):
  single-choice questions reveal immediately on click. Multi-select
  (`multiple_response`) questions require picking exactly `selectCount`
  choices (capped in `ChoicePicker.svelte` — can't over-select) and pressing
  an explicit **"Check answer"** button before reasoning is revealed, so the
  user can reconsider picks first.
- **Reveal correctness scoping** (`ChoiceReview.svelte`): a `revealAll` prop
  (default `true`) controls whether _every_ correct choice is highlighted or
  only the ones the user actually selected. Practice-session's live view
  passes `revealAll={false}` (only grade what was picked); the post-session
  `/history/[id]` review keeps the default `true` (show the actual correct
  answer for missed questions, standard study-app UX). Exam mode never calls
  `ChoiceReview` live — correctness is only ever shown after submission, in
  history review.
- **Mock-exam answer-key protection** — the single most important design
  constraint in this app: while an exam is in progress, the client must never
  be able to derive which choice is correct.
  - `POST /api/exam/start` builds its response through a hand-picked field
    allowlist (`QuestionPublic`/`ChoicePublic` in `$lib/types.ts`) that never
    selects `is_correct`, `reasoning`, **or `sort_order`** into the returned
    shape — not filtered out after the fact, structurally absent. `sort_order`
    matters specifically because the source JSONL always lists the correct
    choice first (`sort_order 0`); this was caught mid-build by noticing a
    simulated "always pick choice[0]" run scored 53/53 — shuffling the
    _array_ order alone wasn't enough, since the `sortOrder` field itself
    still leaked the answer statistically until it was dropped from the
    client-facing type entirely.
  - Choice order is shuffled per-request (`$lib/shuffle.ts`, used by both
    `api/exam/start` and `api/practice/start`) so the correct choice isn't
    reliably in the same position.
  - `POST /api/exam/submit` is stateless between start and submit — it never
    remembers the sampled question set server-side. It re-fetches the real
    choices for whatever question ids the client sends back and re-derives
    correctness from the DB itself (`$lib/scoring.ts`), so it never trusts a
    client-supplied answer/correctness claim.
- **No full-bank loads, anywhere** — an earlier version cached the entire
  question bank (1060 questions / 4240 choices) in module scope and pulled
  all of it on every practice/exam request; that stopped scaling once the
  app moved to Vercel's serverless model (module-scope caching doesn't
  reliably survive cold starts/separate instances, so cache misses were
  common) and doesn't scale as more questions get added over time regardless.
  Every question fetch is now a targeted SQL query sized to what's actually
  needed:
  - **Practice** (`api/practice/start`): `$lib/server/queries.ts#sampleQuestions`
    runs one `SELECT ... WHERE domain_id IN (...) AND difficulty IN (...)
ORDER BY RANDOM() LIMIT n` (filters are optional, applied only if the
    user picked them), then fetches choices only for the returned question
    ids — never the full `choices` table.
  - **Exam sampling** (`$lib/server/examSampler.ts`, see below) and **exam
    grading** (`api/exam/submit` → `getQuestionsByIds`) are equally targeted:
    grading fetches only the exact question ids the client says it was
    shown, not the bank.
  - `getCertMeta()` (cert + 8 domain rows) is the only thing still cached in
    module scope — cheap enough that even a cold-start refetch is
    negligible, and it's what the root layout uses on every page load.
- **Domain- and difficulty-weighted exam sampling** (`$lib/server/examSampler.ts`):
  two layers of proportional allocation, both driven by live DB data rather
  than fixed constants, so the mix self-adjusts as questions are added or
  rebalanced later:
  1. **Domain** — `exam_question_count` (53) is allocated across the 8
     domains proportional to `weight_percentage` (largest-remainder method,
     so counts sum to exactly 53 with no rounding drift) — unchanged from
     before.
  2. **Difficulty** — each domain's slice is further split across difficulty
     levels proportional to that domain's _actual_ published-question counts
     per difficulty (`getDomainDifficultyCounts`, same largest-remainder
     allocator reused with per-difficulty availability as the weights) — so
     a domain skewed toward "medium" naturally draws mostly medium
     questions, rather than every domain drawing a blind uniform random mix.

  Since `(domain, difficulty)` partitions the `questions` table with zero
  overlap, every bucket's `ORDER BY RANDOM() LIMIT n` draw is independent —
  all bucket queries for one exam are sent together via `client.batch(...)`
  as a single network round trip (verified against live Turso — no
  duplicate ids across buckets, since a row can only ever match one
  domain/difficulty combination). Any shortfall (a bucket without enough
  published questions) is topped up by one final unfiltered backfill draw,
  excluding whatever was already picked. The combined set is shuffled once
  more before returning so domains/difficulties aren't grouped together in
  exam order.

- **Exam timer** (`Timer.svelte`): wall-clock derived
  (`startedAt + durationMinutes*60 - now`) rather than a naive `setInterval`
  counter, so refreshing or navigating away and back mid-exam still shows the
  correct remaining time. Ticks via its own component-owned `$effect` +
  `setInterval`; auto-submits via an `ontimeup` callback when it hits zero.
- **Fullscreen distraction-free mode** (`FullscreenToggle.svelte`, exam-only):
  uses `<svelte:document bind:fullscreenElement>` — Svelte 5's native
  readonly binding for that property — instead of manually wiring a
  `fullscreenchange` listener. Escape-to-exit is native browser behavior and
  isn't intercepted.
- **State & persistence** (`src/lib/state/*.svelte.ts`): one runed module per
  concern (`theme`, `practice`, `exam`, `history`), each following Svelte's
  module-state-export rule (`export const x = $state({...})`, mutated only
  via exported functions, never reassigned). Every mutator persists
  synchronously to localStorage in the same call — no watcher `$effect`,
  since a bare module-level `$effect` isn't valid outside a component. Keys
  live under `$lib/constants.ts`'s `STORAGE_KEYS` (`ccdvf:v1:theme`,
  `:practice:inProgress`, `:exam:inProgress`, `:history`, capped at 50
  entries). `$lib/storage/localStorage.ts` centralizes read/write/remove plus
  `clearAllAppData()`, which the header's "Clear my data" menu item
  (`AppHeader.svelte` → `resetAllAppState()` in `state/index.svelte.ts`)
  calls after a confirm dialog — it wipes exactly those keys, never a blanket
  `localStorage.clear()`.
- **Responsive/mobile**: header nav (`AppHeader.svelte`) collapses into the
  existing hamburger dropdown below 640px instead of wrapping; the exam's
  53-tile question-number grid (`QuestionNav.svelte`, inside
  `exam/active/+page.svelte`) is collapsible and defaults collapsed under
  720px so it doesn't push the current question below the fold on a phone.

## Admin (`/admin`)

A single-admin content-upload surface — not a general CMS. Auth is
intentionally minimal ("for now," per the original ask): credentials come
straight from env vars, no user table, no password hashing/rotation, no
rate-limiting/lockout on failed attempts.

- **Credentials**: `.env`'s `ADMIN_USER` / `ADMIN_PASS` (plain values, compared
  with a fixed-length SHA-256 hash + `timingSafeEqual` in
  `$lib/server/adminAuth.ts` to avoid a length/content timing side-channel —
  not because the threat model here is high, just because it's free).
- **Session**: a stateless, self-verifying signed cookie
  (`ccdvf_admin_session`, 12h TTL) — `${expiresAt}.${hmac}` where the HMAC key
  is `.env`'s `ADMIN_SESSION_SECRET` (separate from the login password so the
  signing key isn't also the guessable credential). No server-side session
  store, which matters here for the same reason the old full-bank cache
  didn't work (see Frontend section above): module-scope state doesn't
  reliably survive across Vercel serverless invocations, so a real session
  store would need external storage anyway — a signed cookie sidesteps that
  entirely.
- **The auth guard lives in `src/hooks.server.ts`, not a `+layout.server.ts`
  load function** — this is deliberate and load-bearing. SvelteKit's own docs
  confirm `handle` runs _before_ a form action is invoked, while a layout's
  `load` only runs _after_ an action's side effects, to render the resulting
  page. A guard in `load` would not stop an unauthenticated `POST` straight
  to `/admin?/upload` from executing first. Verified directly: an
  unauthenticated POST to the upload action returns SvelteKit's
  redirect-result JSON with no `uploadResult` in it, and a DB check
  afterward confirmed zero rows were written.
- **Upload flow** (`/admin`, form actions in `+page.server.ts`,
  `$lib/server/adminImport.ts`): accepts a `.jsonl` file (one question object
  per line, same shape as `data/ccdv-f/*.jsonl` / `scripts/import.py`'s
  format), 10MB cap. Every line is parsed and validated up front using the
  _same rules as `scripts/import.py`_ (domain code must exist, valid
  type/difficulty, ≥2 choices, correct-count matches `select`,
  `single_choice`⇒select=1, `multiple_response`⇒select≥2, etc.) — **if any
  line fails, nothing is written at all**, so a partially-bad file can never
  half-corrupt the bank. On success, all writes for the file happen in one
  `client.transaction('write')`.
  - **Upsert semantics** (this is where it differs from `import.py`, which is
    insert-only and errors on a duplicate `external_key`): a question with a
    matching `external_key` is updated in place — its fields are overwritten
    and its choices are deleted and re-inserted from the upload — which is
    what makes this useful as a _correction_ workflow, not just an
    additive one. Questions without an `external_key` are always inserted as
    new, matching `import.py`.
  - Topics and tags are get-or-created the same way `import.py` does
    (scoped to `domain_id` for topics, global for tags).
  - Verified end-to-end against live Turso: create, update-in-place (old
    choices fully replaced, not accumulated), and atomic rejection (one bad
    line in an otherwise-valid file writes zero rows) all behave as
    documented above.
- **Not built**: editing/deleting individual questions through the UI,
  picking a certification (hardcoded to `DEFAULT_CERT_CODE`, fine while
  CCDV-F is the only one), any audit log of who uploaded what.

## Deployment (Vercel)

- **Env vars required on Vercel** (Project Settings → Environment Variables):
  `TURSO_URL`, `TURSO_TOKEN`, and — since the Admin feature was added —
  `ADMIN_USER`, `ADMIN_PASS`, `ADMIN_SESSION_SECRET`. All five are
  `$env/static/private`, which Vite resolves at **build time**: if any is
  missing when Vercel builds, the build fails outright rather than the app
  running with a broken admin login — a missing var here is a hard blocker,
  not a silent runtime bug. These three admin vars were added locally
  (`.env`) but have **not** been pushed to Vercel's dashboard as part of this
  work — that's a manual step still owed before the next deploy.
- **Adapter**: `@sveltejs/adapter-auto` (not `adapter-node` — that produces a
  standalone Node server in `build/`, which isn't Vercel-compatible and causes
  a "No Output Directory named 'public'" build error). In Vercel's project
  settings, the **Output Directory override must stay off** (blank) — pinning
  it to `public` breaks `adapter-auto`'s `.vercel/output` format the same way.
- **`sanitize-html` / `htmlparser2` ESM bug**: `sanitize-html@2.17.6` (latest)
  declares a dependency on `htmlparser2@^12`, which dropped CommonJS support
  entirely — `sanitize-html`'s own `require('htmlparser2')` call crashes at
  runtime on Vercel's Node functions (`ERR_REQUIRE_ESM`) even though it works
  fine locally via Vite dev/build's pre-bundling. Fixed with a `pnpm.overrides`
  entry in `package.json` pinning `htmlparser2` to `9.1.0` (last version with
  proper dual CJS/ESM `exports`). This is an upstream `sanitize-html` bug, not
  something to "fix" by changing app code — re-check if a newer `sanitize-html`
  release resolves it before removing the override.

## Known gaps / not yet built

- No sync **from** the local db **to** Turso Cloud: the app reads exclusively
  from Turso Cloud at runtime (see Repository layout), but `import.py` /
  `rebalance_difficulty.py` only ever write to the local
  `db/claude-mock-exams.db` file. After any local rebuild, the Turso Cloud
  copy has to be updated by hand (e.g. `turso db shell` or re-running the
  import against a Turso connection string) or the live app silently keeps
  serving the old content — there's no push step today.
- The db's `practice_sessions`/`practice_session_items` tables are unused —
  the actual app persists attempts to localStorage instead. If cross-device
  history or an admin/analytics view is ever wanted, that's the gap to close.
- Difficulty rebalancing lives only in the db, not the JSONL source (see
  Content summary) — re-run `rebalance_difficulty.py` after every fresh
  import.
- The answer-length-balance fix (see Content summary) isn't scripted/
  reproducible — it was a one-time editing pass across all 1060 questions.
