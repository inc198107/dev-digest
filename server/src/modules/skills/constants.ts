/**
 * Literals of the skills module (domain ring). No imports from outer rings.
 */

/** Version a new skill starts at; its body is snapshotted as this version. */
export const INITIAL_SKILL_VERSION = 1;

/** Name used when an imported file gives nothing usable to derive one from. */
export const FALLBACK_SKILL_NAME = 'imported-skill';

/** File name (lower case) that holds the core of a packaged skill. */
export const SKILL_CORE_FILE = 'skill.md';

/** Extensions read as Markdown skill text. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;

/** Extensions treated as zip archives (Claude-style `.skill` bundles are zip files). */
export const ARCHIVE_EXTENSIONS = ['.zip', '.skill'] as const;

/** Archive folders whose content is code to run, never skill text. */
export const EXECUTABLE_FOLDERS = ['scripts', 'bin', 'hooks'] as const;

/** Extensions of files that could be executed; listed as ignored, never read. */
export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.bat', '.cmd', '.exe', '.com', '.msi',
  '.dll', '.so', '.dylib', '.py', '.pyc', '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx',
  '.tsx', '.rb', '.pl', '.php', '.lua', '.go', '.rs', '.java', '.jar', '.class', '.wasm', '.vbs',
] as const;

/** Extensions of binary assets; listed as ignored, never read. */
export const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg', '.pdf', '.zip', '.gz', '.tgz',
  '.tar', '.7z', '.rar', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov', '.bin',
] as const;

/** Most file entries an imported archive may hold. */
export const MAX_ARCHIVE_ENTRIES = 200;

/** Most bytes an archive may declare unpacked, summed over its entries (zip-bomb guard). */
export const MAX_ARCHIVE_UNPACKED_BYTES = 5 * 1024 * 1024;

/** Most bytes read when unpacking the skill core (UTF-8 of the longest allowed body). */
export const MAX_SKILL_CORE_BYTES = 256 * 1024;

/** Most HTTP redirects followed when importing from a URL. */
export const MAX_URL_REDIRECTS = 3;

/** Timeout of a URL import (milliseconds). */
export const URL_FETCH_TIMEOUT_MS = 10_000;

/** Days the Skills Lab stats look back (`runs_30d`, `findings_30d`), counted by the DB clock. */
export const SKILL_STATS_WINDOW_DAYS = 30;
