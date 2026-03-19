/**
 * Review Context Module
 *
 * Handles CLAUDE.md existence detection, template generation via `claude /init`,
 * PR header block scaffolding, and write-to-worktree logic.
 *
 * @module ReviewContextContext
 */

export { ReviewContextManager } from "./ReviewContextManager";
export { ReviewContextService } from "./ReviewContextService";
export type { PRHeaderDetails } from "./ReviewContextService";
