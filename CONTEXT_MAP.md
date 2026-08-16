# Claude Certification Question Bank — Context Map

Reference doc for this project's state, design decisions, and how the pieces fit
together. Read this first when picking the work back up. `CLAUDE.md` (short,
auto-loaded by Claude Code every session) points here for the full detail.

## Purpose

A practice-exam web app for the **Claude Certified Developer Foundation
(CCDV-F)** exam: 1060 MCQ questions with full per-choice reasoning, stored in a
SQLite/libSQL (Turso-compatible) database, served by a SvelteKit UI (practice
mode, timed mock exams, history/review, and a full study-notes reference)
deployed on Vercel. Schema is designed to support additional certifications
later, though only CCDV-F content exists now.

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
│   ├── routes/
│   │   ├── +page.svelte             # cert picker — real live cards for both CCDV-F and CCAR-F
│   │   ├── ccdv-f/+page.svelte       # CCDV-F hub — Study Notes / Practice / Mock Exam cards + attempt stats
│   │   ├── ccar-f/+page.svelte       # CCAR-F hub — same shape, own +page.server.ts (getCertMeta('CCAR-F'))
│   │   ├── practice/ccdv-f/, practice/ccar-f/   # +page.svelte (setup) + session/+page.svelte each
│   │   ├── exam/ccdv-f/, exam/ccar-f/           # +page.svelte (setup/resume) + active/+page.svelte each
│   │   ├── history/, history/[id]/
│   │   ├── notes/ccdv-f/             # +layout.svelte (sidebar/scrollspy), +page.svelte (overview), [code]/
│   │   ├── admin/
│   │   │   ├── +page.server.ts        # redirects (307) to /admin/questions — no dashboard screen anymore
│   │   │   ├── login/
│   │   │   └── questions/             # CRUD table + panel + jsonl preview/commit — see "Admin" section below
│   │   │       ├── +page.server.ts, +page.svelte
│   │   │       └── api/                # list, [id] (GET/PATCH/DELETE), +server.ts (POST create),
│   │   │                                #   preview-upload, commit-upload
│   │   └── api/                       # practice/start, exam/start, exam/submit
│   └── lib/
│       ├── components/       # ChoicePicker, ChoiceReview, ScoreBreakdown, Timer, QuestionNav, Markdown,
│       │                      #   FullscreenToggle, NotesDomain, NotesPager, AppHeader, ThemeToggle, ConfirmDialog
│       │   └── admin/          # QuestionsTable (virtualized), QuestionPanel (modal), UploadPreview,
│       │                        #   useQuestionsTable.svelte.ts (table-core wrapper)
│       ├── notes/             # domains.ts (static domain metadata) + content/ccdv-f/*.md (9 study-notes source files)
│       ├── state/             # theme/practice/exam/history .svelte.ts — runed client state, persisted to localStorage
│       ├── storage/            # localStorage.ts — versioned key read/write + clearAllAppData()
│       ├── server/             # db.ts, queries.ts, examSampler.ts, markdown.ts (question bank),
│       │                        #   notesContent.ts + notesMarkdown.ts (study notes), adminAuth.ts,
│       │                        #   adminImport.ts (parse/validate/write jsonl), adminQuestions.ts (CRUD queries),
│       │                        #   questionValidation.ts (validateQuestion(), shared by both admin paths)
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
- **Modes**: `/practice/ccdv-f` (untimed, domain/difficulty filters,
  reveal-as-you-go) and `/exam/ccdv-f` → `/exam/ccdv-f/active` (timed
  53-question mock exam matching the real exam's shape, flagging, question
  nav grid, fullscreen). Both write completed attempts to `/history`, backed
  by localStorage (`src/lib/state/`), not the db's `practice_sessions`
  tables. `/notes/ccdv-f` is a separate, self-contained study-notes
  reference (see its own section below) — not an exam mode, no scoring,
  nothing persisted to the DB. All three routes are namespaced under a
  `ccdv-f` segment on purpose (see "Multi-cert routing" below) — CCAR-F gets
  sibling routes later, not a restructure.
- **Practice-mode answer flow** (`src/routes/practice/ccdv-f/session/+page.svelte`):
  single-choice questions reveal immediately on click. Multi-select
  (`multiple_response`) questions require picking exactly `selectCount`
  choices (capped in `ChoicePicker.svelte` — can't over-select) and pressing
  an explicit **"Check answer"** button before reasoning is revealed, so the
  user can reconsider picks first.
- **Strike-off / eliminate-distractors** (`ChoicePicker.svelte`, both practice
  and exam modes): each choice gets a small strikethrough-icon toggle
  (`struck?: number[]` bindable prop + `onstrike` callback), separate from
  the main selection click, for the classic exam-strategy move of crossing
  out choices you've ruled out.
  - A struck choice's `.option` button gets `disabled` — you cannot select an
    eliminated choice without un-striking it first.
  - Striking an already-**selected** choice auto-deselects it first (can't
    leave the picker in a contradictory "eliminated but still my answer"
    state); un-striking never re-selects anything on its own.
  - Works identically for `multiple_response`: striking a selected choice
    frees up its slot in `selectCount`, so you can pick a replacement: no
    special-casing needed since the guard is per-choice-id, not per-mode.
  - Persisted per-question in session state — `struck: Record<number,
number[]>` on both `PracticeInProgress` and `ExamInProgress`
    (`$lib/types.ts`), with `togglePracticeStrike`/`toggleExamStrike`
    mutators in the respective `$lib/state/*.svelte.ts` modules — so
    navigating away (Previous/Next, the exam's question-nav grid) and back
    keeps your eliminations. It's a candidate note-taking aid only: never
    sent to the server, never scored, and structurally can't leak the answer
    key since it's pure client-side UI state.
  - **Svelte 5 effect-loop gotcha hit while building this** — worth knowing
    before touching `initPracticeSession()`/`initExam()` again: adding a
    migration guard that _read_ `practiceState.session`/`examState.session`
    right after _reassigning_ it, inside the same function (called from the
    root layout's mount `$effect`), made that effect implicitly depend on
    the session object. Since `readJSON()` returns a fresh object reference
    on every call, each re-run reassigned the session and immediately
    re-triggered itself — `effect_update_depth_exceeded`, an infinite loop,
    only on the very first "Start Practice"/"Begin Exam" click of a session
    (i.e. easy to miss in casual testing). Root-caused via git-stash
    bisection, not the error message alone (which just names the generic
    Svelte error, not the offending line). **Fix pattern**: prepare any
    mutation to a freshly-read, not-yet-assigned session on a plain local
    variable first, then assign to the reactive store once, with no
    intermediate read of the reactive field in between. Same fix applied
    symmetrically in both `practice.svelte.ts` and `exam.svelte.ts`.
  - **Same bug family, different shape — a race, not a loop**: submitting a
    mock exam was auto-exiting back to `/exam/ccdv-f` instead of showing
    results. Root cause: `completeExam()` used to null `examState.session`
    _before_ the page navigated to `/history/[id]`; the active exam page's
    own guard effect (`if (!examState.session) goto('/exam/ccdv-f')`) fired
    on that write and raced the explicit navigation — sometimes winning.
    Fixed by splitting `completeExam()` (adds to history only) from a new
    `clearExamSession()` (nulls the session), and calling `clearExamSession()`
    only _after_ `goto()` to the results page has resolved — the guard
    effect never fires while still on the page. General lesson: a guard
    effect keyed on "session went null" can't distinguish _why_ it went
    null (user abandoned vs. just-completed-and-navigating-away) unless the
    caller controls the ordering explicitly.
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
- **Fullscreen distraction-free mode** (`FullscreenToggle.svelte`, reused by
  both exam mode and Study Notes): uses `<svelte:document
bind:fullscreenElement>` — Svelte 5's native readonly binding for that
  property — instead of manually wiring a `fullscreenchange` listener.
  Escape-to-exit is native browser behavior and isn't intercepted. Whatever
  element is passed as `target` must wrap everything that should stay
  visible/usable while fullscreen, since the Fullscreen API only paints the
  target and its descendants — this is also what makes it double as a
  "distraction-free" mode for free: the app header/nav sits outside the
  target, so it disappears too. Both call sites also need a `:fullscreen`
  CSS rule restoring padding/background, since the Fullscreen API detaches
  the element from its normal page layout (`<main>`'s padding no longer
  applies) — see `.exam:fullscreen` and `.notes-page:fullscreen`.
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
  `localStorage.clear()`. See the effect-loop gotcha above before adding any
  new migration/patch-up logic to `initPracticeSession()`/`initExam()`.
- **Known pre-existing gap, not fixed**: a full browser reload (not a
  client-side nav) on `/practice/ccdv-f/session` or `/exam/ccdv-f/active` drops the
  in-progress session and redirects to the setup page — confirmed present
  even on a clean checkout with none of this session's changes, so it's not
  a regression, just an existing limitation. Root cause not investigated;
  likely an ordering issue between the root layout's session-restoring
  effect and the page's own "redirect if no session" effect on a cold
  hydration. Client-side navigation (Previous/Next, the nav-panel grid) is
  unaffected and is how the app is actually used.
- **Responsive/mobile**: header nav (`AppHeader.svelte`) collapses into the
  existing hamburger dropdown below 640px instead of wrapping; the exam's
  53-tile question-number grid (`QuestionNav.svelte`, inside
  `exam/ccdv-f/active/+page.svelte`) is collapsible and defaults collapsed under
  720px so it doesn't push the current question below the fold on a phone.
- **Scrollbars**: a global thin, theme-aware scrollbar (`app.css`, `*` +
  `::-webkit-scrollbar`/`scrollbar-width: thin`) replaces each browser's
  default chunky one everywhere in the app — note it's essentially invisible
  in headless-Chromium screenshots regardless of the CSS (a headless-mode
  default, not a bug); verify visually with a real, non-headless browser
  window if touching this again.
- **Full-page background coverage gotcha** (`app.css`, `.app-shell` in
  `+layout.svelte`): the natural-looking `html, body { height: 100% }`
  clips the painted `--bg` to exactly one viewport tall — a page taller
  than that (e.g. a long Study Notes page) has an unpainted gap below the
  fold showing the browser's own dark-canvas fill instead of the theme
  color. The equally natural-looking fix, swapping to `min-height: 100%`,
  is _also_ broken: percentage `min-height` needs the parent (`html`/`body`)
  to have a _definite_ height, which `height: auto` (even with a min-height
  floor) doesn't reliably provide across browsers — short pages then
  shrink-wrap to content instead of filling the viewport, same unpainted-gap
  symptom in the opposite direction. The actual fix: `.app-shell` uses
  `min-height: 100dvh` (a real viewport unit, not a percentage of an
  ambiguous parent) — grows for tall content, fills short content, no
  parent-chain dependency either way. `html { background: var(--bg) }`
  stays as a cheap safety net.
- **Design tokens** (`app.css` `:root`): `--accent` is Dodger Blue
  (`#1e90ff` light theme, `#5aabff` dark — lightened for dark-bg contrast,
  same pattern the previous green followed). `--success`/`--success-soft`
  are deliberately a _separate_ green family (the "correct answer"
  indicator) and were not touched when the accent changed — don't conflate
  the two if asked to retheme again. `--radius-sm/md/lg` are all `0`
  (square-corners design decision) — since every card/panel/input/table in
  the app reads from these three tokens, redefining them at the root is
  the one-edit way to reach "everywhere"; only a handful of components use
  a _literal_ radius instead of the tokens (pill-shaped chips/progress-bar
  tracks — zeroed individually — and genuine circles: the radio-dot
  indicator, strike-button, and confirm-dialog icon, all `border-radius:
50%`, deliberately left alone since those are circles by design, not
  "rounded corners"). `button { border-radius: 0 !important }` also exists
  as a global override, because component-level button classes (`.primary`,
  `.chip`, ...) set their own `border-radius` on a class selector, which
  beats a bare `button` element rule on specificity — `!important` is the
  only way to force it from one place instead of touching every component.

## Multi-certification routing & navigation

`/` is a cert picker with real, live cards for both certs (CCDV-F links to
`/ccdv-f`, CCAR-F links to `/ccar-f`) — the home route now has its own
`+page.server.ts` calling `getCertMeta('CCDV-F')` and `getCertMeta('CCAR-F')`
explicitly (`Promise.all`), since the root layout only ever supplies the
default cert. `/ccdv-f` and `/ccar-f` are each a hub: Study Notes / Practice
/ Mock Exam cards. Practice, exam, and notes routes are each namespaced
under a per-cert path segment (`/practice/ccdv-f`, `/practice/ccar-f`,
`/exam/ccdv-f`, `/exam/ccar-f`, `/notes/ccdv-f`, `/notes/ccar-f`) — the
CCAR-F question bank was seeded and Practice/Mock Exam went live for it as a
content/seeding + routing follow-up once the CCDV-F-only pattern had proved
out (notes first, then practice/exam, then CCAR-F's own sibling routes).

- **Root layout only loads the default cert.** `src/routes/+layout.server.ts`
  calls `getCertMeta()` with no argument (defaults to `DEFAULT_CERT_CODE` =
  `'CCDV-F'`), so any CCAR-F-namespaced route branch needs its own server
  load overriding that data — see `src/routes/ccar-f/+page.server.ts`,
  `src/routes/practice/ccar-f/+layout.server.ts`, and
  `src/routes/exam/ccar-f/+layout.server.ts`, each calling
  `getCertMeta('CCAR-F')`. SvelteKit merges a child load's return value over
  the parent's by key, so this correctly overrides `certification`/`domains`
  for everything under that branch without touching the CCDV-F routes.
- **`getCertMeta` is keyed by cert code**, not a single unkeyed singleton —
  it caches one promise per `certCode` in a `Map` (`$lib/server/db.ts`).
  Before CCAR-F went live this was a single `Promise | null`, which would
  have silently poisoned the cache with whichever cert's data loaded first
  in a given server process once two certs were both real. Keep it keyed if
  a third cert is ever added.
- **`/api/practice/start`, `/api/exam/start`, `/api/exam/submit`** all now
  accept an optional `cert` field in the POST body (defaults to
  `DEFAULT_CERT_CODE` if absent, so old clients/callers still work) and pass
  it through to `getCertMeta(certCode)`. Every CCDV-F/CCAR-F page that calls
  these sends its own `data.certification.code` explicitly — don't rely on
  the server-side default once more than one cert can reach these endpoints.
- **`ExamInProgress` carries `certCode`** (added alongside the pre-existing
  `PracticeInProgress.certCode`) so the resumable in-progress exam session
  knows which cert it belongs to; `startExam()` takes `certCode` as part of
  its payload. Both exam and practice in-progress guards (`session/+page.svelte`,
  `exam/.../active/+page.svelte`) check `session.certCode === data.certification.code`
  before treating a stored session as valid for the current page — without
  this, navigating to the other cert's practice/exam route while a session
  for the _first_ cert was in progress would render that cert's questions
  under the wrong cert's domain/session-page context.
- **In-progress practice/exam sessions are still a single global localStorage
  slot each** (`STORAGE_KEYS.practiceInProgress` / `.examInProgress`), not
  namespaced per cert — starting a new session in one cert while a session
  for the other cert is in progress still overwrites it, same limitation
  that existed pre-CCAR-F, just now reachable from either cert's routes. Not
  fixed as part of enabling CCAR-F; would need per-cert storage keys plus a
  migration path for existing single-key sessions if this becomes a problem.
- **Hub-page stats are filtered by cert.** `src/routes/ccdv-f/+page.svelte`
  and `src/routes/ccar-f/+page.svelte` both derive `attemptsForThisCert`/
  `examAttempts` by filtering `historyState.attempts` on
  `a.certCode === data.certification.code` — history itself is one global
  list across both certs (`$lib/state/history.svelte.ts`), so without this
  filter a CCAR-F exam score would bleed into the CCDV-F hub's "best exam
  score" stat and vice versa.
- **Header dropdowns** (`AppHeader.svelte`): Practice, Mock Exam, and Study
  Notes are each a dropdown (desktop, one open at a time via a single
  `openDropdown` state) / independently-collapsible group (mobile) with
  real CCDV-F and CCAR-F `<a>` links — no disabled/"Coming soon" entries
  remain anywhere in the header or on the `/` cert picker.
  - **Written as three explicit blocks, not a `{#each groups}` loop** —
    deliberately, after hitting a real `svelte/no-navigation-without-resolve`
    lint failure: the rule can trace a plain top-level `const x =
resolve(...)` used directly as `href={x}`, but not the same resolved
    string stored as a property on an array of objects and accessed via a
    loop variable (`href={item.href}`) — too much indirection for its
    static check, even though the value is provably a `resolve()` result at
    runtime. If tempted to de-duplicate this into a loop or a snippet
    again, confirm `pnpm run lint` first — props/snippet-parameters likely
    hit the same limitation as array properties did.
- **Don't `git mv` route files while `pnpm run dev` is running**: doing this
  once crashed the whole dev server — SvelteKit's type-sync watcher does a
  bare `readFileSync` on changed route files to regenerate `$types`, and hit
  an uncaught `ENOENT` mid-rename (the old path was gone, the new one not
  yet indexed), which isn't wrapped in a try/catch anywhere in the vite-dev
  entrypoint. Kills the Node process outright, not just a reload — restart
  `pnpm run dev` after any bulk route-file rename.

## Study Notes (`/notes/ccdv-f`, `/notes/ccar-f`)

A self-contained exam-prep reference distinct from practice/exam modes — no
scoring, nothing DB-backed, nothing persisted. Built to read well for both
"cramming before the exam" and genuine first-time learning, not just recall
drills. Now covers **two certs**: CCDV-F (Developer) and CCAR-F (Architect,
added after CCDV-F's launch — the first real use of the multi-cert pattern
routing was namespaced for from the start).

- **Content source** — `src/lib/notes/content/<cert>/*.md`, one folder per
  cert (`content/ccdv-f/`, `content/ccar-f/`): each is `overview.md` plus one
  file per exam domain. CCDV-F: `applications-integration.md`,
  `model-selection-optimization.md`, `agents-workflows.md`,
  `prompt-context-engineering.md`, `tools-mcps.md`, `security-safety.md`,
  `claude-code.md`, `eval-testing-debugging.md`. CCAR-F:
  `agentic-architecture.md`, `claude-code-config.md`,
  `prompt-structured-output.md`, `tool-design-mcp.md`,
  `context-management-reliability.md`. Filenames must match the domain
  `code` values wired into `src/lib/notes/domains.ts` — that file (not the
  presence of a `.md` file alone) is the source of truth for which domains
  appear, their titles, weights, and sidebar order, keyed per cert in a
  `CERT_DOMAINS` record. Adding a domain to an existing cert means updating
  both; adding a whole new cert means adding a `CERT_DOMAINS[code]` entry,
  a `content/<cert>/` folder, and a sibling `routes/notes/<cert>/` tree
  (layout + `+page.server.ts`/`+page.svelte` + `[code]/` — copy the ccdv-f
  or ccar-f tree verbatim and swap the hardcoded cert string in the layout's
  `hrefFor`/`isActive` and the two `+page.server.ts` loaders).
- **`getNotesSection(cert, code)`** (`$lib/server/notesContent.ts`) and the
  `domains.ts` helpers (`domainsFor`, `titleFor`, `weightFor`,
  `domainOrderFor`) all take an explicit `cert` argument now — genericized
  from a CCDV-F-only single-cert module when CCAR-F notes were added. The
  `import.meta.glob` in `notesContent.ts` is `content/*/*.md` (cert and code
  both come from the matched path), and the per-section render cache is
  keyed `${cert}/${code}`.
- **CCAR-F's exam blueprint (domains + weight percentages) is
  crowdsourced/third-party**, not from an Anthropic-published official
  guide — cross-checked across two independent community sources
  (`daronyondem/claude-architect-exam-guide` on GitHub and
  claudecertificationguide.com) that agreed exactly on all 5 domains and
  weights (27/20/20/18/15) before being used. If Anthropic publishes an
  official blueprint later, diff against it — third-party numbers drift.
- **Authoring syntax** (enforced by the custom renderer, `$lib/server/notesMarkdown.ts`):
  - No `#` (h1) in content files — the page itself renders the domain title
    as `<h1>`; content starts at `##`.
  - Blockquote callouts, plain markdown `>`: `**Exam tip:**` (what's likely
    tested), `**Gotcha:**` (common wrong-answer trap), `**Note:**`
    (background), `**In practice:**` (real-world usage color that isn't
    necessarily exam-tested — added specifically to keep "will this be on
    the exam" material visually distinct from "useful to actually know").
  - `{{Term|definition}}` — renders a `<dfn>` with a hover/tap tooltip
    (`data-def` + CSS, keyboard-focusable via `tabindex`).
  - `{{youtube:VIDEO_ID|Title}}` on its own line — embeds a video. **Only
    ever include a video ID actually confirmed real via search** (one was
    caught and removed after a content-writing pass invented one that didn't
    resolve to anything on WebSearch); when in doubt, omit rather than
    guess.
  - KaTeX: inline `$...$`, block `$$\n...\n$$`.
  - Mermaid: normal ` ```mermaid ` fenced blocks.
  - Everything else is plain GFM (tables, fenced code with a language tag for
    syntax highlighting, etc.).
  - Code examples across all domain files are **Python-only** by policy (an
    explicit fix after early drafts mixed Python/TypeScript/curl
    inconsistently and it read as confusing rather than thorough) — curl
    only appears where the point is literally the wire format (e.g. raw SSE
    streaming), always labeled as such. `overview.md` has the canonical
    "API vs. SDK" terminology explainer this policy is documented against.
- **Rendering pipeline** (`$lib/server/notesMarkdown.ts` + `notesContent.ts`):
  a `Marked` instance with custom extensions for the syntax above, plus
  custom renderers for `heading` (slug `id`s for anchor links/sidebar
  scrollspy), `code` (mermaid → passthrough `<pre class="mermaid"
data-src="...">` for client-side rendering; otherwise `hljs.highlight`
  with the given language, or explicit `'plaintext'` if untagged — **not**
  `hljs.highlightAuto`, which is both slower and prone to mis-guessing a
  language for non-code content like directory trees), `table` (wrapped in
  a horizontally-scrollable `.table-scroll` div), and `link` (external
  `http(s)` links get `target="_blank" rel="noopener noreferrer"`).
  Deliberately **not** run through `sanitize-html` (unlike the question-bank
  renderer, `$lib/server/markdown.ts`) — this content is 100% static and
  repo-authored, never user input, and sanitizing would fight the allowlist
  for KaTeX/mermaid/iframe output with no real safety benefit.
  - `getNotesSection(code)` **caches its rendered HTML in a module-scope
    `Map`** — this was a real perf fix, not just a nicety: before caching,
    the full marked+KaTeX+highlight.js pipeline re-ran on _every single
    request_ to the same page, measured at ~850ms for the largest domain
    file; cached, repeat requests on a warm instance dropped to ~20ms. Same
    "module-scope cache, cheap enough" pattern as `getCertMeta()`.
- **Client-side diagram rendering** (`NotesDomain.svelte`): mermaid is
  dynamically imported (code-split, not in the main bundle) and re-run on
  theme toggle. Two non-obvious settings are load-bearing for correctness,
  not just style, and are easy to "clean up" back into a bug later:
  - `flowchart: { htmlLabels: false }` — the foreignObject-based HTML label
    mode was measuring node text at width/height 0 in this setup, silently
    clipping node text mid-word. Plain SVG `<text>` labels size correctly.
  - **No `fontFamily` override** (don't set it to `'inherit'` or anything
    else) — mermaid measures label width using its own default font before
    drawing; overriding the render font without also matching it in
    measurement makes the rendered text wider than what was measured,
    which — same symptom — clips it against the node's computed box.
  - `securityLevel: 'loose'` is required (not `'strict'`, the default) for
    some sub-elements (e.g. edge labels) that render via foreignObject
    regardless of the `htmlLabels` flowchart setting above; safe here since
    100% of diagram source is repo-authored, never user input.
  - Each rendered diagram gets a small expand-to-modal zoom button, added by
    mounting a Lucide icon component **imperatively** (Svelte 5's `mount()`/
    `unmount()` from `'svelte'`) into a `<button>` created via plain
    `document.createElement`, since that button lives inside mermaid's own
    raw SVG output (outside Svelte's template) — tracked in a `Map` per
    mermaid `<pre>` node so a re-render (theme toggle, page nav) unmounts
    the old icon before the node's `innerHTML` is replaced, avoiding a leak.
    The zoom modal itself re-derives explicit pixel `width`/`height` from
    the SVG's `viewBox` before display — mermaid's inline SVG is sized for
    its small in-page box (`width="100%"`, no `height` attribute, an inline
    `max-width` style), none of which resolves to anything sensible inside
    a larger modal, so the modal was rendering blank until this was added.
- **Layout & navigation** (`src/routes/notes/+layout.svelte`, shared across
  `/notes/ccdv-f` and `/notes/ccdv-f/[code]`):
  - Left sidebar (desktop, sticky, its own scroll — needed an explicit
    `overflow-y: auto` since `max-height` alone doesn't imply scrolling) /
    off-canvas drawer with a backdrop (mobile, triggered by a small sticky
    translucent icon button, not a full labeled button — deliberately
    minimal so it doesn't compete with page content).
  - The active domain's headings nest under it in the sidebar and are
    individually collapsible (chevron toggle) so one long domain's heading
    list doesn't push every other domain off-screen.
  - **Scrollspy**: an `IntersectionObserver` over the rendered `h2`/`h3`
    elements highlights whichever heading the reader is currently at in the
    sidebar, re-armed on navigation to a new domain page (headings are
    queried straight from the DOM `NotesDomain.svelte` renders — no shared
    store needed, since the layout and the page content share the same DOM
    subtree).
  - `min-width: 0` is required on the sidebar's grid content column — grid
    items default to a content-based minimum width, so without this, wide
    content (a mermaid diagram, a long code line) blew out the whole page
    into horizontal scroll instead of scrolling inside its own box. General
    lesson for any future two-column grid layout in this app.
- **Content authorship**: the initial 8-domain build and later comprehensive
  revision pass (adding real code samples, CLI references, file-structure
  examples) were both done via parallel background subagents, one per
  domain, each independently researching current docs via WebFetch/WebSearch
  rather than relying on training-data recall — deliberately, since exact
  field names/CLI flags/config shapes are exactly the kind of thing that
  goes stale or gets misremembered, and this is exam-prep content where
  precision matters.

## Admin (`/admin`, `/admin/questions`)

Single-admin content management — not a general CMS. Auth is intentionally
minimal ("for now," per the original ask): credentials come straight from
env vars, no user table, no password hashing/rotation, no rate-limiting/
lockout on failed attempts. `/admin` itself is just a `307` redirect to
`/admin/questions` (the old stats-dashboard landing screen was removed —
"don't need the summary screen, show the table right away").

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
  load function** — this is deliberate and load-bearing, and covers
  everything under `/admin/*` including the newer `/admin/questions/api/*`
  routes via a `pathname.startsWith('/admin')` prefix check (no route-by-route
  wiring needed). SvelteKit's own docs confirm `handle` runs _before_ a form
  action or API route handler is invoked, while a layout's `load` only runs
  _after_ an action's side effects, to render the resulting page — a guard in
  `load` would not stop an unauthenticated `POST` from executing first.
  Verified directly against the old upload action: an unauthenticated POST
  returned SvelteKit's redirect-result JSON with no result payload, and a DB
  check afterward confirmed zero rows were written.

### Question CRUD (`/admin/questions`)

Browse/search/edit/create/delete individual questions, plus a bulk `.jsonl`
upload that previews the whole batch before writing anything.

- **Shared validation & write path** — the single most important thing to
  know before touching this: `$lib/server/questionValidation.ts` exports
  `validateQuestion()` (mirrors `scripts/import.py`'s rules exactly — domain
  code must exist, valid type/difficulty, ≥2 choices, correct-count matches
  `select`, etc.), and `$lib/server/adminImport.ts` exports
  `writeOneQuestion()` (topic/tag get-or-create, question upsert, choices
  delete+reinsert, all inside a caller-supplied transaction). Both the
  single-question CRUD path (`adminQuestions.ts#saveQuestion`) and the bulk
  jsonl commit path (`adminImport.ts#writeValidatedQuestions`) call the same
  two functions — there is exactly one place that knows how a question gets
  validated and exactly one place that knows how it gets written. Don't
  reimplement either inline in a route handler.
- **Listing** (`adminQuestions.ts#listQuestionsPage`, `api/list/+server.ts`):
  keyset-paginated (`WHERE id > ? ORDER BY id LIMIT ?`), bounded columns
  only, optional domain/difficulty/type/search filters — same "no full-bank
  load" discipline as exam/practice sampling, just for the admin surface.
  `getQuestionDetail()` (full question + choices, raw text not rendered
  HTML — this is the editor, not the exam-delivery surface) is fetched only
  when a row is opened.
- **Table + virtualization** (`$lib/components/admin/`): `@tanstack/
table-core` **v8.21.3** pinned deliberately, not v9 — the docs originally
  linked were v8's, and v8's Svelte _adapter_ package requires Svelte 3/4,
  but `table-core` itself (the framework-agnostic engine, no Svelte peer
  dep at all) works fine standalone regardless. v9's `table-core` was
  checked too and rejected: it's a full plugin/feature-composition rewrite
  (`tableFeatures`, `constructTable`, no simple `createTable(options)`),
  meaningfully heavier than what's needed here. `@tanstack/svelte-virtual`
  handles row virtualization. Only column defs + header-group rendering are
  used from table-core — no sorting/filtering features enabled (the server
  owns filtering; rows are always `ORDER BY id` for the keyset cursor to
  work).
  - **Bare `createTable()` doesn't self-populate per-feature default
    state** the way a framework adapter (`useReactTable` etc.) normally
    does — crashed `getHeaderGroups()` with `Cannot read properties of
undefined (reading 'left')` (a column-pinning feature reading state
    that was never populated). Fix, in `useQuestionsTable.svelte.ts`:
    merge `table.initialState` into the controlled `$state` once right
    after construction, then push it back via one `table.setOptions()` call
    — replicates by hand what a real adapter does on mount.
  - **`@tanstack/svelte-virtual`'s `setOptions()` always force-emits a new
    store value**, even when the visible range doesn't change (its own
    source comment: "in case count increased but scroll position stayed
    the same"). An `$effect` that reads `$virtualizer` (store
    auto-subscription syntax) to call `.setOptions()` on it therefore
    depends on its own output — infinite synchronous loop, froze the tab.
    Fix: grab the instance once via `get(virtualizer)` from `svelte/store`
    (untracked, plain reference) and call `.setOptions()` on _that_, never
    through `$virtualizer` — the template can still read `$virtualizer`
    freely for re-render, since that direction was never the problem.
- **Panel** (`QuestionPanel.svelte`): a centered modal (`min(900px, 100%)`
  wide, up to `88vh` tall, dimmed backdrop, click-outside/Escape to close —
  not the app's usual right-docked drawer pattern, changed on request).
  View mode shows choices with correct/incorrect + reasoning, explanation,
  reference, tags; Edit mode is the same field set as the jsonl shape
  (domain/type/difficulty/select/stem/explanation/reference/external_key/
  topic/tags/choices), with `select_count` auto-derived from how many
  choice checkboxes are checked rather than typed separately, to avoid a
  whole class of "select doesn't match correct-count" validation errors.
  Delete reuses `ConfirmDialog.svelte`.
  - Panel/backdrop surface colors: `.panel` uses `var(--bg)`, its inputs use
    `var(--surface)` — this was flipped once (panel→`--surface`,
    inputs→`--bg`) to fix a "modal blends into the backdrop" contrast issue
    in dark theme, then flipped back on explicit feedback that the original
    pairing looked better. If revisiting this, check contrast in dark theme
    specifically before changing it again — it's the tightest constraint.
  - **A bare `<svg>` icon as the sole child of a flex button can collapse
    to `width: 0`** despite an explicit `width="18"` HTML attribute —
    confirmed via DevTools (`0 × 18` in the computed box, not a guess). Fix:
    `flex-shrink: 0` on the button _and_ on the icon itself via
    `.icon-btn :global(svg)` (the icon renders inside a child component, so
    it needs an explicit `:global()` to reach past this file's scoped CSS).
- **Bulk upload — preview then commit, not write-on-upload** (a deliberate
  change from the old behavior): `UploadPreview.svelte` posts the `.jsonl`
  file to `api/preview-upload` (parses + validates via
  `parseAndValidateJsonl()`, returns the batch — **no DB write**) for
  review, then posts the _same file_ again to `api/commit-upload`, which
  re-parses and re-validates from scratch server-side (never trusts a
  client-supplied "already validated" claim) before calling
  `writeValidatedQuestions()` in one transaction. If any line fails
  validation at either step, nothing is written — same all-or-nothing
  guarantee `import.py` and the old upload action had.
  - Upsert semantics unchanged from the original upload flow: a question
    with a matching `external_key` is updated in place (choices deleted +
    re-inserted, not accumulated); one without is always inserted as new.
    Topics/tags are get-or-created the same way `import.py` does.
- **CCAR-F**: the cert selector reads whatever's in the `certifications`
  table — CCAR-F was seeded (`data/ccar-f/_certification.json` + 300+
  question JSONL files imported via `scripts/import.py`) and appears in the
  admin UI automatically, same as CCDV-F, with no admin-tooling changes
  needed (the layer was already `certificationId`-parameterized throughout).
- **Not built**: column sorting in the table (rows are always `id`-ordered,
  a deliberate scope cut — keyset pagination needs a stable order anyway),
  per-row cherry-picking within a bulk-upload preview (it's commit-all or
  cancel), any audit log of who edited/uploaded what.
- **Gotcha, not code**: a `git mv` of route files while `pnpm run dev` is
  watching crashed the whole dev server once (see "Multi-certification
  routing" above) — happened while moving `practice`/`exam` routes, not
  specific to admin, but worth knowing if reorganizing `admin/questions/`
  routes later too.

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
  Locally, `pnpm run build` output lands in `.svelte-kit/output/` (what
  `pnpm run preview` actually serves) — a stale `build/` directory left over
  from an earlier local setup is **not** part of this pipeline and isn't
  regenerated by `pnpm run build`; don't trust its contents/timestamps if it
  still exists on disk, and it's safe to delete.
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
- A full page reload mid-practice/mid-exam drops the in-progress session
  (see Frontend section) — not investigated/fixed, confirmed pre-existing.
- The Study Notes pages have no automated content-freshness check — domain
  files were grounded against live docs at write time, but nothing re-verifies
  them later if upstream docs change (e.g. Claude Code's CLAUDE.md/settings
  schema, which moves fast).
- **Pre-existing `prettier --check` debt** in ~46 files unrelated to the
  admin/routing work above (noticed via a full `pnpm run lint` run, not
  introduced by it — every file actually touched during that work was
  individually reformatted and lints clean). Not investigated/fixed; a
  blanket `pnpm run format` would resolve it but hasn't been run since it'd
  touch far more than any single task's scope.
- `+page.server.ts` (and `+page.svelte`) files only accept a fixed export
  allow-list (`load`, `actions`, `prerender`, `csr`, `ssr`,
  `trailingSlash`, `config`, `entries`, or anything `_`-prefixed) — an
  incidental `export const PAGE_SIZE = 50` in `admin/questions/+page.server.ts`
  crashed the dev server outright the moment that route was hit ("Invalid
  export"), not just a type error `pnpm run check` would catch. Keep
  route-local constants un-exported.
