/**
 * Brace-balanced JSON extraction from LLM replies (M5).
 *
 * Previous approach: `text.match(/\{[\s\S]*\}/)` — greedy and picks the
 * first `{` through the LAST `}`. If Claude's reply contains an example
 * object inside markdown followed by the real answer, the greedy regex
 * concatenates them into a syntactically invalid blob.
 *
 * This scans forward looking for a complete, balanced object, and skips
 * over strings (including escaped quotes) so braces inside strings don't
 * throw off the counter. Tries each candidate as JSON and returns the
 * first one that parses.
 */

export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;

  // Fast path: body already parses.
  try {
    return JSON.parse(text);
  } catch { /* fall through */ }

  // Strip markdown ```json fences if present.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try { return JSON.parse(fenceMatch[1]); } catch { /* continue */ }
  }

  // Scan for each possible `{…}` and try to parse.
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const end = findMatchingBrace(text, start);
    if (end < 0) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch { /* try next start */ }
  }
  return null;
}

function findMatchingBrace(s: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inString = false; continue; }
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
