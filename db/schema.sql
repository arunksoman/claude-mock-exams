-- Claude Certification Question Bank — schema
-- Designed to hold MCQ content for multiple certifications (CCDV-F now, more later)
-- and to drive a future quiz/practice-exam UI (filtering, tagging, session/attempt tracking).

PRAGMA foreign_keys = ON;

-- One row per certification track (e.g. CCDV-F, future CCDV-A, CCDV-P, ...)
CREATE TABLE certifications (
    id                     INTEGER PRIMARY KEY,
    code                   TEXT NOT NULL UNIQUE,        -- 'CCDV-F'
    name                   TEXT NOT NULL,                -- 'Claude Certified Developer - Foundations'
    vendor                 TEXT NOT NULL DEFAULT 'Anthropic',
    description            TEXT,
    exam_question_count    INTEGER,                      -- real exam length, e.g. 53
    exam_duration_minutes  INTEGER,                       -- e.g. 120
    passing_score          INTEGER,                       -- e.g. 720
    max_score              INTEGER,                       -- e.g. 1000
    is_active              INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Exam blueprint domains within a certification, with real exam weightings.
-- Drives proportional practice-exam generation and per-domain score breakdowns in the UI.
CREATE TABLE domains (
    id                  INTEGER PRIMARY KEY,
    certification_id    INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
    code                TEXT NOT NULL,                 -- 'applications-integration'
    name                TEXT NOT NULL,                 -- 'Applications & Integration'
    weight_percentage   REAL,                          -- 33.1
    description         TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    UNIQUE (certification_id, code)
);

-- Optional finer-grained grouping within a domain (e.g. "Streaming", "Prompt caching").
-- Nullable on questions so tagging can be adopted incrementally.
CREATE TABLE topics (
    id           INTEGER PRIMARY KEY,
    domain_id    INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    UNIQUE (domain_id, name)
);

-- Free-form labels for cross-cutting UI filters/search (independent of the domain hierarchy).
CREATE TABLE tags (
    id     INTEGER PRIMARY KEY,
    name   TEXT NOT NULL UNIQUE
);

-- Core question bank.
CREATE TABLE questions (
    id                 INTEGER PRIMARY KEY,
    certification_id   INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
    domain_id          INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    topic_id           INTEGER REFERENCES topics(id) ON DELETE SET NULL,
    external_key       TEXT UNIQUE,                    -- stable human-readable id, e.g. 'ccdvf-ai-0142'
    question_type      TEXT NOT NULL CHECK (question_type IN ('single_choice','multiple_response','true_false')),
    difficulty         TEXT NOT NULL CHECK (difficulty IN ('easy','medium','intermediate','difficult')),
    stem               TEXT NOT NULL,                  -- the question text
    select_count       INTEGER NOT NULL DEFAULT 1,     -- number of choices the test-taker must select
    explanation        TEXT,                           -- overall rationale tying the correct choice(s) together
    reference          TEXT,                           -- pointer to the underlying concept/doc area (no external links required)
    status             TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','retired')),
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Answer choices. Every choice (correct or not) carries its own reasoning
-- so the UI can show "why this is right / why this is wrong" per option.
CREATE TABLE choices (
    id             INTEGER PRIMARY KEY,
    question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    label          TEXT NOT NULL,                      -- choice text
    is_correct     INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0,1)),
    reasoning      TEXT NOT NULL,                      -- why this option is correct/incorrect
    sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE question_tags (
    question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (question_id, tag_id)
);

-- Forward-looking tables for a practice/quiz UI (mock exams, review-mistakes mode, bookmarks).
-- user_label is free text rather than a users table since no auth system exists yet;
-- swapping in a real user_id later is a non-breaking column addition.
CREATE TABLE practice_sessions (
    id                  INTEGER PRIMARY KEY,
    certification_id    INTEGER NOT NULL REFERENCES certifications(id),
    user_label          TEXT,
    mode                TEXT NOT NULL CHECK (mode IN ('practice','timed_exam','review_mistakes','custom')),
    started_at          TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at        TEXT,
    score               REAL,
    total_questions     INTEGER
);

CREATE TABLE practice_session_items (
    id                     INTEGER PRIMARY KEY,
    session_id             INTEGER NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    question_id            INTEGER NOT NULL REFERENCES questions(id),
    selected_choice_ids    TEXT,                       -- JSON array of choice ids
    is_correct             INTEGER CHECK (is_correct IN (0,1)),
    time_spent_seconds     INTEGER,
    flagged                INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0,1)),
    sort_order             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_domains_cert            ON domains(certification_id);
CREATE INDEX idx_topics_domain           ON topics(domain_id);
CREATE INDEX idx_questions_cert          ON questions(certification_id);
CREATE INDEX idx_questions_domain        ON questions(domain_id);
CREATE INDEX idx_questions_difficulty    ON questions(difficulty);
CREATE INDEX idx_questions_type          ON questions(question_type);
CREATE INDEX idx_choices_question        ON choices(question_id);
CREATE INDEX idx_question_tags_tag       ON question_tags(tag_id);
CREATE INDEX idx_session_items_session   ON practice_session_items(session_id);
CREATE INDEX idx_session_items_question  ON practice_session_items(question_id);

-- Convenience view for UI dashboards / QA: per-question correct-choice count,
-- so the app (and the importer) can sanity-check select_count against actual data.
CREATE VIEW v_question_summary AS
SELECT
    q.id,
    q.certification_id,
    q.domain_id,
    q.external_key,
    q.question_type,
    q.difficulty,
    q.select_count,
    COUNT(c.id)                                   AS choice_count,
    SUM(CASE WHEN c.is_correct = 1 THEN 1 ELSE 0 END) AS correct_choice_count
FROM questions q
JOIN choices c ON c.question_id = q.id
GROUP BY q.id;
