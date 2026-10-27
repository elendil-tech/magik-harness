// What a command can throw, a typo helper, and the plain words for a path that cannot be used.
// No imports, so any module can use it.

/** The command was used wrongly: exit 2. */
export class UsageError extends Error {}

/** A refusal the person can act on: print the message, exit with `code`. */
export class Failure extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/** How many single-letter changes turn `a` into `b`. */
export function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(above + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** Longer than this is not a mistyped id, command or option, and comparing it letter by letter costs more than it is worth. */
export const LONGEST_TYPO = 80;

/** The closest of `options` to `word`, if any is close enough to be a likely typo. */
export function closest(word, options) {
  if (word.length > LONGEST_TYPO) return undefined;
  const lower = word.toLowerCase();
  const limit = Math.max(2, Math.floor(word.length / 3));
  let best = null;
  for (const o of options) {
    const other = o.toLowerCase();
    // words whose lengths differ by more than the limit cannot be within it: no need to compare them
    if (Math.abs(other.length - lower.length) > limit) continue;
    const d = distance(lower, other);
    if (d <= limit && (!best || d < best.d)) best = { o, d };
  }
  return best?.o;
}

/** A message that is never longer than a screenful, however much of the person's input it repeats. */
export function clip(text, max = 1500) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const WHY = {
  EEXIST: "it already exists",
  ENOTDIR: "a part of the path is a file, not a folder",
  EISDIR: "it is a folder, not a file",
  ENOENT: "it does not exist",
  ENAMETOOLONG: "the name is too long",
  EACCES: "permission denied",
  EPERM: "permission denied",
  EROFS: "the file system is read-only",
};

const DOING = { mkdir: "create the folder", open: "open", rename: "rename", unlink: "remove", rmdir: "remove the folder", scandir: "read the folder", copyfile: "copy", stat: "look at", lstat: "look at", realpath: "look at" };

/**
 * The words for an error the operating system gave about a path someone passed
 * in (a folder to start a project in, one to write views to), or null for any
 * other error. Such a path is the person's to fix, so it is a usage error and
 * not an unexpected one.
 */
export function pathProblem(e) {
  if (!e || typeof e !== "object" || typeof e.path !== "string" || typeof e.code !== "string" || !Object.hasOwn(WHY, e.code)) return null;
  return `cannot ${DOING[e.syscall] ?? "use"} ${e.path}: ${WHY[e.code]}`;
}
