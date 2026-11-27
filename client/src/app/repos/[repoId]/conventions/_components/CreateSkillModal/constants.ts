/**
 * Constants of CreateSkillModal. Limits restate the API's `@devdigest/shared` values because
 * client code imports only types from the shared package.
 */

/** Longest skill description (`MAX_SKILL_DESCRIPTION_CHARS`). */
export const MAX_DESCRIPTION_CHARS = 500;

/** Longest skill body (`MAX_SKILL_BODY_CHARS`). */
export const MAX_BODY_CHARS = 20_000;

/** Width of the modal (px), as in the design. */
export const MODAL_WIDTH = 760;
