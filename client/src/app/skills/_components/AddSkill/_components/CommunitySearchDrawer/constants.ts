/** Width of the drawer (px), as in the design. */
export const DRAWER_WIDTH = 480;

/** Shortest search text that runs a search (the API's `CommunitySkillQuery` minimum). */
export const MIN_QUERY_CHARS = 2;

/** Pause after the last keystroke before the search runs (ms): GitHub search is rate-limited. */
export const SEARCH_DEBOUNCE_MS = 400;

/** Quick tags offered under the search box; a click adds the tag to the search text. */
export const QUICK_TAGS = ["security", "performance", "testing"] as const;

/** Skeleton cards shown while the first result loads. */
export const LOADING_CARDS = 3;
