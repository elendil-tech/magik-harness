// What a command can throw, and a typo helper. No imports, so any module can use it.

/** The command was used wrongly: exit 2. */
export class UsageError extends Error {}

/** A refusal the person can act on: print the message, exit with `code`. */
export class Failure extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** The closest of `options` to `word`, if any is close enough to be a likely typo. */
export function closest(word, options) {
  let best = null;
  for (const o of options) {
    const d = distance(word.toLowerCase(), o.toLowerCase());
    if (d <= Math.max(2, Math.floor(word.length / 3)) && (!best || d < best.d)) best = { o, d };
  }
  return best?.o;
}
