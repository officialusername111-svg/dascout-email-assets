// Pure module — no DOM. Pragmatic validation: something@something.tld, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRecipients(raw) {
  const tokens = raw
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set();
  const valid = [];
  const invalid = [];

  for (const token of tokens) {
    if (EMAIL_RE.test(token)) {
      const key = token.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        valid.push(token);
      }
    } else {
      invalid.push(token);
    }
  }
  return { valid, invalid };
}
