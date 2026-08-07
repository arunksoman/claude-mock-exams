"""
Rebalance the 'difficulty' label distribution without touching question content.

Current state is heavily skewed toward 'medium'. This redistributes a portion
of each domain's 'medium'-labeled questions into 'intermediate' and 'difficult'
using a deterministic, evenly-spread pattern (based on row position within each
domain, ordered by id), so the shift is reproducible and spread throughout each
domain rather than clustering in one file/topic.

Target pattern per domain, applied to that domain's existing 'medium' pool only
(easy/intermediate/difficult questions that already have those labels are left
untouched): roughly 50% stay medium, 30% become intermediate, 20% become difficult.
"""
import sqlite3
import sys
from pathlib import Path

db_path = Path("db/claude-mock-exams.db")
conn = sqlite3.connect(db_path)
conn.execute("PRAGMA foreign_keys = ON")

rows = conn.execute(
    """SELECT q.id, q.domain_id
       FROM questions q
       WHERE q.difficulty = 'medium'
       ORDER BY q.domain_id, q.id"""
).fetchall()

# Assign a repeating 10-slot pattern per domain: 5 medium, 3 intermediate, 2 difficult
pattern = ["medium"] * 5 + ["intermediate"] * 3 + ["difficult"] * 2

from collections import defaultdict
counters = defaultdict(int)
updates = []  # (new_difficulty, id)

for qid, domain_id in rows:
    idx = counters[domain_id] % len(pattern)
    counters[domain_id] += 1
    new_diff = pattern[idx]
    if new_diff != "medium":
        updates.append((new_diff, qid))

conn.executemany("UPDATE questions SET difficulty = ?, updated_at = datetime('now') WHERE id = ?", updates)
conn.commit()

print(f"Reassigned {len(updates)} questions out of {len(rows)} 'medium' questions.")

print("\nNew distribution:")
for row in conn.execute(
    """SELECT d.name, q.difficulty, COUNT(*) FROM questions q
       JOIN domains d ON d.id = q.domain_id
       GROUP BY d.name, q.difficulty
       ORDER BY d.sort_order, CASE q.difficulty
         WHEN 'easy' THEN 1 WHEN 'medium' THEN 2
         WHEN 'intermediate' THEN 3 WHEN 'difficult' THEN 4 END"""
):
    print(f"  {row[0]:35s} {row[1]:12s} {row[2]}")

print("\nOverall totals:")
for row in conn.execute("SELECT difficulty, COUNT(*) FROM questions GROUP BY difficulty ORDER BY COUNT(*) DESC"):
    print(f"  {row[0]:12s} {row[1]}")

conn.close()
