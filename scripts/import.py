"""
Load a certification manifest (_certification.json) plus its question JSONL files
into the SQLite/Turso database, applying db/schema.sql first if needed.

Usage:
    python scripts/import.py <cert_data_dir> [--db db/claude-mock-exams.db] [--reset]

<cert_data_dir> must contain:
    _certification.json   - certification + domain metadata (see ccdv-f example)
    *.jsonl                - one question object per line (any filenames)

Each question line looks like:
{
  "domain": "applications-integration",   // must match a domain code in _certification.json
  "topic": "Streaming responses",         // optional, free text -> auto-created topics row
  "external_key": "ccdvf-ai-0001",        // optional, must be globally unique if present
  "type": "single_choice" | "multiple_response",
  "difficulty": "easy" | "medium" | "intermediate" | "difficult",
  "select": 1,                            // how many choices are correct
  "stem": "...",
  "explanation": "...",
  "reference": "...",                     // optional
  "tags": ["streaming", "sdk"],           // optional
  "choices": [
    {"text": "...", "correct": true,  "reasoning": "..."},
    {"text": "...", "correct": false, "reasoning": "..."}
  ]
}
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path


def load_jsonl(path: Path):
    """Parse a stream of concatenated JSON objects. Tolerates pretty-printed
    (multi-line) objects placed one after another, unlike strict one-object-per-line JSONL."""
    text = path.read_text(encoding="utf-8")
    decoder = json.JSONDecoder()
    items = []
    idx = 0
    length = len(text)
    while idx < length:
        while idx < length and text[idx] in " \t\r\n":
            idx += 1
        if idx >= length:
            break
        try:
            obj, end = decoder.raw_decode(text, idx)
        except json.JSONDecodeError as e:
            snippet = text[idx:idx + 200]
            raise SystemExit(f"{path}: invalid JSON at offset {idx} - {e}\n  near: {snippet!r}")
        items.append(obj)
        idx = end
    return items


def get_or_create_tag(conn, name):
    cur = conn.execute("SELECT id FROM tags WHERE name = ?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur = conn.execute("INSERT INTO tags (name) VALUES (?)", (name,))
    return cur.lastrowid


def get_or_create_topic(conn, domain_id, name):
    if not name:
        return None
    cur = conn.execute("SELECT id FROM topics WHERE domain_id = ? AND name = ?", (domain_id, name))
    row = cur.fetchone()
    if row:
        return row[0]
    cur = conn.execute("INSERT INTO topics (domain_id, name) VALUES (?, ?)", (domain_id, name))
    return cur.lastrowid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir", type=Path)
    ap.add_argument("--db", type=Path, default=Path("db/claude-mock-exams.db"))
    ap.add_argument("--schema", type=Path, default=Path("db/schema.sql"))
    ap.add_argument("--reset", action="store_true", help="drop and recreate the certification's data before importing")
    args = ap.parse_args()

    manifest_path = args.data_dir / "_certification.json"
    if not manifest_path.exists():
        raise SystemExit(f"missing manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    args.db.parent.mkdir(parents=True, exist_ok=True)
    is_new_db = not args.db.exists()
    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA foreign_keys = ON")

    existing_tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    if is_new_db or "questions" not in existing_tables:
        conn.executescript(args.schema.read_text(encoding="utf-8"))
        conn.commit()
        print(f"applied schema -> {args.db}")

    cur = conn.execute("SELECT id FROM certifications WHERE code = ?", (manifest["code"],))
    row = cur.fetchone()
    if row and args.reset:
        conn.execute("DELETE FROM certifications WHERE id = ?", (row[0],))
        conn.commit()
        row = None

    if row:
        cert_id = row[0]
        conn.execute(
            """UPDATE certifications SET name=?, vendor=?, description=?, exam_question_count=?,
               exam_duration_minutes=?, passing_score=?, max_score=?, updated_at=datetime('now')
               WHERE id=?""",
            (manifest["name"], manifest.get("vendor", "Anthropic"), manifest.get("description"),
             manifest.get("exam_question_count"), manifest.get("exam_duration_minutes"),
             manifest.get("passing_score"), manifest.get("max_score"), cert_id),
        )
        print(f"certification {manifest['code']} already exists (id={cert_id}); updating metadata, reusing domains")
    else:
        cur = conn.execute(
            """INSERT INTO certifications (code, name, vendor, description, exam_question_count,
               exam_duration_minutes, passing_score, max_score)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (manifest["code"], manifest["name"], manifest.get("vendor", "Anthropic"),
             manifest.get("description"), manifest.get("exam_question_count"),
             manifest.get("exam_duration_minutes"), manifest.get("passing_score"),
             manifest.get("max_score")),
        )
        cert_id = cur.lastrowid
        print(f"created certification {manifest['code']} (id={cert_id})")

    domain_ids = {}
    for d in manifest["domains"]:
        cur = conn.execute(
            "SELECT id FROM domains WHERE certification_id = ? AND code = ?",
            (cert_id, d["code"]),
        )
        row = cur.fetchone()
        if row:
            domain_ids[d["code"]] = row[0]
            conn.execute(
                "UPDATE domains SET name=?, weight_percentage=?, description=?, sort_order=? WHERE id=?",
                (d["name"], d.get("weight_percentage"), d.get("description"), d.get("sort_order", 0), row[0]),
            )
        else:
            cur = conn.execute(
                """INSERT INTO domains (certification_id, code, name, weight_percentage, description, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (cert_id, d["code"], d["name"], d.get("weight_percentage"), d.get("description"), d.get("sort_order", 0)),
            )
            domain_ids[d["code"]] = cur.lastrowid
    conn.commit()

    jsonl_files = sorted(args.data_dir.glob("*.jsonl"))
    if not jsonl_files:
        raise SystemExit(f"no .jsonl files found in {args.data_dir}")

    total_q = 0
    total_c = 0
    errors = []

    for jf in jsonl_files:
        items = load_jsonl(jf)
        for idx, item in enumerate(items, 1):
            ctx = f"{jf.name}#{idx}"
            domain_code = item.get("domain")
            if domain_code not in domain_ids:
                errors.append(f"{ctx}: unknown domain code '{domain_code}'")
                continue
            domain_id = domain_ids[domain_code]

            qtype = item.get("type")
            if qtype not in ("single_choice", "multiple_response", "true_false"):
                errors.append(f"{ctx}: bad question type '{qtype}'")
                continue

            difficulty = item.get("difficulty")
            if difficulty not in ("easy", "medium", "intermediate", "difficult"):
                errors.append(f"{ctx}: bad difficulty '{difficulty}'")
                continue

            choices = item.get("choices", [])
            correct_n = sum(1 for c in choices if c.get("correct"))
            select_count = item.get("select", 1)

            if len(choices) < 2:
                errors.append(f"{ctx}: fewer than 2 choices")
                continue
            if correct_n == 0:
                errors.append(f"{ctx}: no correct choice marked")
                continue
            if correct_n != select_count:
                errors.append(f"{ctx}: select={select_count} but {correct_n} choices marked correct")
                continue
            if qtype == "single_choice" and select_count != 1:
                errors.append(f"{ctx}: single_choice must have select=1")
                continue
            if qtype == "multiple_response" and select_count < 2:
                errors.append(f"{ctx}: multiple_response must have select>=2")
                continue

            external_key = item.get("external_key")
            topic_id = get_or_create_topic(conn, domain_id, item.get("topic"))

            try:
                cur = conn.execute(
                    """INSERT INTO questions
                       (certification_id, domain_id, topic_id, external_key, question_type,
                        difficulty, stem, select_count, explanation, reference)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (cert_id, domain_id, topic_id, external_key, qtype, difficulty,
                     item["stem"], select_count, item.get("explanation"), item.get("reference")),
                )
            except sqlite3.IntegrityError as e:
                errors.append(f"{ctx}: {e}")
                continue
            question_id = cur.lastrowid
            total_q += 1

            for order, c in enumerate(choices):
                conn.execute(
                    """INSERT INTO choices (question_id, label, is_correct, reasoning, sort_order)
                       VALUES (?, ?, ?, ?, ?)""",
                    (question_id, c["text"], 1 if c.get("correct") else 0, c["reasoning"], order),
                )
                total_c += 1

            for tag_name in item.get("tags", []):
                tag_id = get_or_create_tag(conn, tag_name)
                conn.execute(
                    "INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)",
                    (question_id, tag_id),
                )

    conn.commit()

    print(f"\nimported {total_q} questions, {total_c} choices from {len(jsonl_files)} file(s)")

    if errors:
        print(f"\n{len(errors)} ERROR(S):")
        for e in errors[:50]:
            print(f"  - {e}")
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more")

    print("\nper-domain / per-difficulty counts:")
    for row in conn.execute(
        """SELECT d.name, q.difficulty, COUNT(*) FROM questions q
           JOIN domains d ON d.id = q.domain_id
           WHERE q.certification_id = ?
           GROUP BY d.name, q.difficulty ORDER BY d.sort_order, q.difficulty"""
        , (cert_id,)
    ):
        print(f"  {row[0]:35s} {row[1]:12s} {row[2]}")

    conn.close()
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
