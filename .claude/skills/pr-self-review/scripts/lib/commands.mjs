/**
 * Detects the shell commands the gate cares about inside a Bash or PowerShell command line:
 * opening a pull request, merging one, and `git push`. Quoted text is never treated as a
 * command, so a commit message that mentions `gh pr create` does not trigger the gate.
 */

/**
 * @typedef {object} Token
 * @property {string} text Token text without quotes.
 * @property {boolean} quoted True when any part of the token was quoted.
 * @property {boolean} sep True for a command separator.
 */

/**
 * @typedef {object} GatedCommand
 * @property {'create'|'merge'|'push'} kind What the command does.
 * @property {string | null} target PR number, URL or branch for `merge`; `--head` branch for
 *   `create`; null for the current branch.
 * @property {string | null} repo `--repo` value passed to gh, if any.
 * @property {string} text The command segment, for messages.
 */

/** Separators that end one simple command. */
const SEPARATORS = ['&&', '||', ';', '|', '\n', '&'];

/** Tokens that may precede the real program name in a segment. */
const WRAPPERS = new Set(['&', 'exec', 'command', 'time', 'env', 'sudo', 'noglob', '(', '{', '!']);

/** `gh pr merge` flags that take a value. */
const MERGE_VALUE_FLAGS = new Set(['-t', '--subject', '-b', '--body', '-F', '--body-file', '-A', '--author-email', '--match-head-commit', '-R', '--repo']);

/**
 * Remove the bodies of bash here-documents, so text fed to `cat <<EOF` is never parsed as
 * commands.
 * @param {string} line Command line.
 * @returns {string} Command line without here-document bodies.
 */
export function stripHeredocs(line) {
  const opener = /<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/g;
  let out = '';
  let from = 0;
  for (let m = opener.exec(line); m; m = opener.exec(line)) {
    const bodyStart = line.indexOf('\n', m.index + m[0].length);
    if (bodyStart === -1) break;
    const lines = line.slice(bodyStart + 1).split('\n');
    let consumed = bodyStart + 1;
    let closed = false;
    for (const l of lines) {
      consumed += l.length + 1;
      const candidate = m[1] === '-' ? l.replace(/^\t+/, '') : l;
      if (candidate.replace(/\r$/, '') === m[3]) {
        closed = true;
        break;
      }
    }
    out += line.slice(from, bodyStart + 1);
    from = closed ? Math.min(consumed, line.length) : line.length;
    opener.lastIndex = from;
  }
  return out + line.slice(from);
}

/**
 * Index of the quote that closes the quoted string opened at `start`. Inside double quotes a
 * quote escaped with `\` (bash) or a backtick (PowerShell) does not close it.
 * @param {string} line Command line.
 * @param {number} start Index of the opening quote.
 * @returns {number} Index of the closing quote, or the line length when it is missing.
 */
function closingQuote(line, start) {
  const q = line[start];
  for (let i = start + 1; i < line.length; i += 1) {
    if (q === '"' && (line[i] === '\\' || line[i] === '`')) {
      i += 1;
      continue;
    }
    if (line[i] === q) return i;
  }
  return line.length;
}

/**
 * Split a command line into tokens, keeping quoted strings whole.
 * @param {string} line Command line.
 * @returns {Token[]} Tokens, including separator tokens.
 */
export function tokenize(line) {
  /** @type {Token[]} */
  const tokens = [];
  let text = '';
  let quoted = false;
  let open = false;
  const flush = () => {
    if (open) tokens.push({ text, quoted, sep: false });
    text = '';
    quoted = false;
    open = false;
  };
  const src = stripHeredocs(line);
  for (let i = 0; i < src.length; i += 1) {
    const ch = /** @type {string} */ (src[i]);
    if (ch === '"' || ch === "'") {
      const stop = closingQuote(src, i);
      text += src.slice(i + 1, stop);
      quoted = true;
      open = true;
      i = stop;
      continue;
    }
    if (ch === '\\' && src[i + 1] === '\n') {
      i += 1;
      flush();
      continue;
    }
    const sep = SEPARATORS.find((s) => src.startsWith(s, i));
    if (sep) {
      flush();
      tokens.push({ text: sep, quoted: false, sep: true });
      i += sep.length - 1;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    text += ch;
    open = true;
  }
  flush();
  return tokens;
}

/**
 * Split tokens into simple commands.
 * @param {Token[]} tokens Tokens from {@link tokenize}.
 * @returns {Token[][]} Segments without separator tokens.
 */
function segments(tokens) {
  /** @type {Token[][]} */
  const out = [[]];
  for (const t of tokens) {
    if (t.sep) out.push([]);
    else out[out.length - 1]?.push(t);
  }
  return out.filter((s) => s.length > 0);
}

/**
 * Index of the program token: the first token that is not an env assignment or a wrapper.
 * @param {Token[]} seg Segment tokens.
 * @returns {number} Index, or -1 when the segment has no program.
 */
function programIndex(seg) {
  for (let i = 0; i < seg.length; i += 1) {
    const t = /** @type {Token} */ (seg[i]);
    if (!t.quoted && (WRAPPERS.has(t.text) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t.text) || /^\$env:/i.test(t.text))) continue;
    return i;
  }
  return -1;
}

/**
 * True when a token names the given program (plain, with `.exe`, or as a path).
 * @param {Token | undefined} t Token.
 * @param {string} name Program name.
 * @returns {boolean} Whether it matches.
 */
function isProgram(t, name) {
  if (!t || (t.quoted && !/[\\/]/.test(t.text))) return false;
  const base = t.text.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  return base === name || base === `${name}.exe`;
}

/**
 * Value of `-R` / `--repo` in an argument list.
 * @param {string[]} args Arguments.
 * @returns {string | null} The repo, or null.
 */
function repoFlag(args) {
  for (let i = 0; i < args.length; i += 1) {
    const a = /** @type {string} */ (args[i]);
    if (a === '-R' || a === '--repo') return args[i + 1] ?? null;
    if (a.startsWith('--repo=')) return a.slice('--repo='.length);
  }
  return null;
}

/**
 * Branch given to `gh pr create --head`, without an `owner:` prefix.
 * @param {string[]} args Arguments after `create`.
 * @returns {string | null} Branch, or null when the current branch is used.
 */
function headFlag(args) {
  for (let i = 0; i < args.length; i += 1) {
    const a = /** @type {string} */ (args[i]);
    const value = a === '-H' || a === '--head' ? args[i + 1] : a.startsWith('--head=') ? a.slice('--head='.length) : undefined;
    if (value) return value.includes(':') ? value.slice(value.indexOf(':') + 1) : value;
  }
  return null;
}

/**
 * First positional argument of `gh pr merge`.
 * @param {string[]} args Arguments after `merge`.
 * @returns {string | null} PR number, URL or branch, or null.
 */
function mergeTarget(args) {
  for (let i = 0; i < args.length; i += 1) {
    const a = /** @type {string} */ (args[i]);
    if (MERGE_VALUE_FLAGS.has(a)) {
      i += 1;
      continue;
    }
    if (a.startsWith('-')) continue;
    return a;
  }
  return null;
}

/**
 * Classify a `gh api` call that opens or merges a pull request.
 * @param {string[]} args Arguments after `api`.
 * @returns {{ kind: 'create'|'merge', target: string | null } | null} Classification, or null.
 */
function classifyGhApi(args) {
  const endpoint = args.find((a) => /(^|\/)pulls(\/\d+\/merge)?\/?$/.test(a));
  if (!endpoint) return null;
  const merge = /pulls\/(\d+)\/merge\/?$/.exec(endpoint);
  if (merge) return { kind: 'merge', target: merge[1] ?? null };
  const methodIdx = args.findIndex((a) => a === '-X' || a === '--method');
  const method = (methodIdx >= 0 ? args[methodIdx + 1] : args.find((a) => a.startsWith('--method='))?.slice(9)) ?? '';
  const hasFields = args.some((a) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(a));
  if (method.toUpperCase() === 'POST' || (!method && hasFields)) return { kind: 'create', target: null };
  return null;
}

/**
 * Find every gated command in a command line.
 * @param {string} line Bash or PowerShell command line.
 * @returns {GatedCommand[]} Gated commands, in order.
 */
export function detectGatedCommands(line) {
  /** @type {GatedCommand[]} */
  const found = [];
  for (const seg of segments(tokenize(line))) {
    const at = programIndex(seg);
    if (at < 0) continue;
    const prog = seg[at];
    const args = seg.slice(at + 1).map((t) => t.text);
    const text = seg.slice(at).map((t) => t.text).join(' ');
    if (isProgram(prog, 'gh')) {
      const sub = args.filter((a, i) => !(a === '-R' || a === '--repo' || args[i - 1] === '-R' || args[i - 1] === '--repo' || a.startsWith('--repo=')));
      const repo = repoFlag(args);
      if (sub[0] === 'pr' && (sub[1] === 'create' || sub[1] === 'new')) {
        found.push({ kind: 'create', target: headFlag(sub.slice(2)), repo, text });
      } else if (sub[0] === 'pr' && sub[1] === 'merge') {
        found.push({ kind: 'merge', target: mergeTarget(sub.slice(2)), repo, text });
      } else if (sub[0] === 'api') {
        const api = classifyGhApi(sub.slice(1));
        if (api) found.push({ ...api, repo, text });
      }
    } else if (isProgram(prog, 'git')) {
      let i = 0;
      while (i < args.length && /** @type {string} */ (args[i]).startsWith('-')) {
        i += ['-C', '-c', '--git-dir', '--work-tree'].includes(/** @type {string} */ (args[i])) ? 2 : 1;
      }
      if (args[i] === 'push') found.push({ kind: 'push', target: null, repo: null, text });
    }
  }
  return found;
}
