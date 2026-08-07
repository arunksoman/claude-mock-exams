"""
Add markdown code-span highlighting to question/choice text across all JSONL
source files, in place. Rewrites data/ccdv-f/*.jsonl.

Rules applied to each text field (stem, explanation, choice text, choice
reasoning):

  1. Whole-field code wrap: if a *choice* text field is entirely a code/JSON
     snippet (contains `{...}`, or starts with a recognizable code prefix
     like `tool_choice:`), or is an HTTP-status-style literal (e.g.
     "429 Too Many Requests"), wrap the WHOLE field in a single backtick
     code span (if not already).

  2. Paired single-quote conversion: 'term' -> `term`, for short (<=80 char,
     no newline) spans bounded by whitespace/start/bracket on the left and
     whitespace/punctuation/end on the right. This specifically excludes
     contractions (isn't, don't) and possessives (model's, agents') because
     those apostrophes are never preceded by a boundary character on the
     left side of the pattern.

  3. Bare snake_case identifiers (tool_choice, is_error, max_tokens, ...)
     anywhere in remaining (non-backticked) text get wrapped in backticks,
     skipping anything already inside backticks from rule 1/2.

Safe to re-run: rules skip text that's already backtick-wrapped.
"""
import json
import re
from pathlib import Path

DATA_DIR = Path("data/ccdv-f")

# --- Rule 1: whole-field code detection (choice text only) ---
CODE_WHOLE_PATTERNS = [
    re.compile(r'^`.*`$'),  # already wrapped, leave alone (handled separately)
    re.compile(r'.*\{.*".*"\s*:.*\}.*'),          # contains a {"key": ...} JSON fragment
    re.compile(r'^tool_choice\s*:', re.I),
    re.compile(r'^stream\s*:\s*(true|false)', re.I),
    re.compile(r'^cache_control\b'),
    re.compile(r'^\d{3}(\s+[A-Za-z].*)?$'),        # "429" or "429 Too Many Requests"
]

def whole_field_should_wrap(text: str) -> bool:
    t = text.strip()
    if not t or t.startswith('`'):
        return False
    if re.search(r'\{.*".*"\s*:.*\}', t):
        return True
    if re.match(r'^(tool_choice|stream|cache_control)\s*[:{]', t, re.I):
        return True
    if re.match(r'^\d{3}(\s+[A-Za-z].*)?$', t):
        return True
    return False

# --- Rule 2: paired single-quote -> backtick code span ---
# Group 1 = boundary char (or empty at start), Group 2 = quoted content
QUOTE_PATTERN = re.compile(r"(^|[\s(\[])'([^'\n]{1,80}?)'(?=$|[\s.,;:!?)\]])")

def convert_quotes(text: str) -> str:
    def repl(m):
        boundary, content = m.group(1), m.group(2)
        # don't re-wrap if content itself looks like it's already got backticks
        if content.startswith('`') and content.endswith('`'):
            return f"{boundary}{content}"
        return f"{boundary}`{content}`"
    return QUOTE_PATTERN.sub(repl, text)

# --- Rule 3: bare snake_case identifiers -> backtick, skipping already-backticked spans ---
SNAKE_CASE = re.compile(r'\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b')

def wrap_bare_snake_case(text: str) -> str:
    # Split on backtick-delimited spans so we never touch already-formatted content
    parts = re.split(r'(`[^`]*`)', text)
    for i, part in enumerate(parts):
        if part.startswith('`'):
            continue
        parts[i] = SNAKE_CASE.sub(lambda m: f"`{m.group(0)}`", part)
    return ''.join(parts)

def markdownify_field(text: str, allow_whole_wrap: bool) -> str:
    if not isinstance(text, str) or not text:
        return text
    if allow_whole_wrap and whole_field_should_wrap(text):
        return f"`{text.strip()}`"
    text = convert_quotes(text)
    text = wrap_bare_snake_case(text)
    return text

def load_jsonl(path: Path):
    text = path.read_text(encoding="utf-8")
    decoder = json.JSONDecoder()
    items, idx, length = [], 0, len(text)
    while idx < length:
        while idx < length and text[idx] in " \t\r\n":
            idx += 1
        if idx >= length:
            break
        obj, end = decoder.raw_decode(text, idx)
        items.append(obj)
        idx = end
    return items

def process_item(item: dict) -> dict:
    if "stem" in item:
        item["stem"] = markdownify_field(item["stem"], allow_whole_wrap=False)
    if "explanation" in item and item["explanation"]:
        item["explanation"] = markdownify_field(item["explanation"], allow_whole_wrap=False)
    for choice in item.get("choices", []):
        if "text" in choice:
            choice["text"] = markdownify_field(choice["text"], allow_whole_wrap=True)
        if "reasoning" in choice:
            choice["reasoning"] = markdownify_field(choice["reasoning"], allow_whole_wrap=False)
    return item

def format_item(item: dict) -> str:
    # Keep it human-readable (pretty, but compact) same style as originally authored
    return json.dumps(item, ensure_ascii=False)

def main():
    files = sorted(DATA_DIR.glob("*.jsonl"))
    total_items = 0
    total_files = 0
    for f in files:
        items = load_jsonl(f)
        new_items = [process_item(it) for it in items]
        f.write_text("\n".join(format_item(it) for it in new_items) + "\n", encoding="utf-8")
        total_items += len(new_items)
        total_files += 1
    print(f"Markdownified {total_items} questions across {total_files} files.")

if __name__ == "__main__":
    main()
