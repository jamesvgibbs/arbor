# Arbor

## Overview

Arbor is a local Electron desktop application that bridges GitHub pull request discovery with isolated git worktree creation and scoped Claude Code sessions. Engineers select an open PR from any GitHub repository, Arbor creates a git worktree under a configurable local path, optionally scaffolds a CLAUDE.md review context file, and launches a Claude Code session rooted in that worktree — all without leaving the app or touching their main branch.

| Field        | Value                  |
| ------------ | ---------------------- |
| Product Lead | @jgibbs                |
| Tech Lead    | @jgibbs                |
| Design Lead  | N/A                    |
| Epic         | Link epic once created |
| Approved By  |                        |

## Goal

- **Developer Velocity**: Eliminate the 6-step manual process (fetch, create worktree, cd, scaffold context, launch agent, clean up) for reviewing PRs locally with AI assistance
- **Context Quality**: Ensure every Claude Code session starts with scoped context about the PR under review, improving the quality of AI-assisted review conversations
- **Team Enablement**: Make the workflow available to all engineers regardless of GitHub org or repo, with low-friction GitHub OAuth so it works on day one without token management

## Problem

Reviewing pull requests locally with Claude Code today requires a developer to manually fetch the PR branch, create a git worktree, navigate to it, craft a CLAUDE.md with PR context, and launch Claude Code — then reverse all of that when done. There is no tooling that connects the GitHub PR list to a local AI-assisted review session as a single flow.

- **Who is affected**: All engineers who do local code review, currently VP of Engineering and all engineering pods at Second Nature; designed to generalize to any GitHub user
- **Why it's critical**: The manual process is high-friction enough that engineers skip local review in favor of in-browser GitHub review, losing IDE-quality navigation, AI assistance, and the ability to run/test the code under review

## Risks

- **T3 Code Fork Drift**: Forking `pingdotgg/t3code` as the foundation means upstream changes may conflict with Arbor additions. Mitigation: keep all Arbor-specific logic in isolated modules; avoid modifying core orchestration code
- **GitHub OAuth App Approval**: For multi-user deployment beyond the author, a GitHub OAuth App must be registered. Scope creep in permissions could flag the app. Mitigation: request minimum scopes (`repo:read`, `pull_request:read`)
- **Claude Code CLI Dependency**: Arbor relies on the Claude Code CLI being installed and authenticated on the host machine. If not present, the session launch fails silently. Mitigation: health check on startup with actionable error messaging
- **Worktree Disk Bloat**: `node_modules` and build artifacts in worktrees can consume significant disk space. Mitigation: configurable cleanup prompt + worktree size display in session list
- **CLAUDE.md Conflicts**: If a repo has a root-level CLAUDE.md that differs from what Arbor would generate, we must not overwrite it. Mitigation: explicit detection and skip logic with user notification

## Dependencies

**Technologies**: Electron, TypeScript, React, Tailwind CSS, `simple-git` (npm), Octokit GitHub SDK, `@anthropic-ai/claude-code` SDK, Turborepo monorepo (inherited from T3 Code fork)

**Teams**: Solo initially (Jim); intended for broader Second Nature engineering org adoption

**Third-Party**: GitHub REST API (PR listing, repo metadata), GitHub OAuth App (authentication), Claude Code CLI (must be installed on host)

## Requirements

### Functional Requirements for GitHub Integration

- The app must allow a user to authenticate with GitHub via OAuth and store the token securely in Electron's keychain
- The app must allow a user to add one or more GitHub repositories by owner/repo slug (e.g. `secondnature-com/rbp-api`)
- The app must fetch and display all open pull requests for each configured repository, showing: PR number, title, author, age, CI status (pass/fail/pending), and review status (approved/changes requested/awaiting)
- The PR list must refresh automatically on a configurable interval (default: 5 minutes) and support manual refresh
- The app must support repositories from any GitHub organization or user account, not only Second Nature repos

### Functional Requirements for Worktree Management

- Displaying the PR list requires no local clone — PR metadata is fetched entirely via GitHub API
- When a user initiates a PR review or branch collaboration session for a repo not yet cloned locally, the app must perform a full bare clone (`git clone --bare`) into `{basePath}/{repoName}/_base/`; shallow clones are explicitly prohibited as they break worktree behavior with older branches
- Subsequent worktrees for the same repo reuse the existing bare clone; no re-clone is needed
- When a user selects a PR to review, the app must create a git worktree at `{configured_base_path}/{repo_name}/pr-{number}-{branch-slug}` (default base path: `/Users/{username}/Code/`)
- The base worktree path must be configurable per-user in app settings
- Worktree creation must fetch the PR branch from origin before creating the local worktree
- The app must display all active worktrees in a session list with: repo name, PR number/title, branch name, disk size, and date created
- If a worktree already exists for a given PR (e.g. user re-selects it), the app must open the existing session rather than create a duplicate
- When a PR transitions to **merged** or **closed without merge** (detected during refresh), the app must automatically remove the associated worktree silently — no prompt required
- When a PR transitions to **approved** (detected during refresh), the app must display a non-blocking toast notification offering cleanup: "PR #[number] was approved — clean up worktree?" with Accept / Later options; if Later is chosen, the session remains until manually cleaned or the PR merges
- Manual cleanup is always available from the session list context menu regardless of PR state
- Cleanup behavior configuration applies only to the manual-close flow; lifecycle-driven cleanup (merge = auto, approval = offer) is not user-configurable in v1

### Functional Requirements for CLAUDE.md Context Scaffolding

- Before launching a Claude Code session, the app must check whether a `CLAUDE.md` file exists in the worktree root
- If a `CLAUDE.md` already exists (committed in the repo), the app must not modify it; it must display a non-blocking notice: "Using existing CLAUDE.md found in repo"
- If no `CLAUDE.md` exists, the app must run `claude /init` in the worktree directory to generate a repo-aware context file, then prepend a PR-specific header block to the top of the generated file
- The PR header block must include: PR number, title, author, base branch, and `git diff {base}...HEAD --stat` output
- The generated and modified CLAUDE.md must be written only to the worktree directory, never committed or pushed
- The `claude /init` step must be skippable per-session and globally disableable in settings; if skipped, only the PR header block is written without repo context

### Functional Requirements for Claude Code Session

- After worktree setup and optional CLAUDE.md scaffolding, the app must launch a Claude Code session rooted in the worktree directory
- The Claude Code session must use the existing Claude Code CLI installation and authentication on the host machine; Arbor must not manage Claude credentials
- The session conversation must be embedded in the Arbor UI (not opened in an external terminal), using the Claude Code SDK/IPC layer inherited from T3 Code
- The user must be able to have a full conversational session with Claude about the worktree codebase: ask questions, request analysis, request changes
- Multiple sessions for different PRs must be able to run concurrently, displayed as tabs or a session switcher in the sidebar
- The app must surface a health check on startup that verifies Claude Code CLI is installed and authenticated; if not, it must show a clear setup prompt with installation instructions

### Functional Requirements for Settings

- GitHub OAuth token management (connect, disconnect, re-authenticate)
- Worktree base path configuration with directory picker
- Cleanup behavior toggle: prompt on close vs. manual only
- CLAUDE.md auto-generation toggle: always offer, never offer, always generate without asking
- PR list refresh interval (1 min, 5 min, 15 min, manual only)
- Configurable list of tracked repositories (add, remove, reorder)

### Non-Functional Requirements

- The app must start and show the PR list within 3 seconds on a machine with an existing GitHub token
- Worktree creation must complete within 10 seconds for repos under 1GB (excluding initial clone time)
- The app must handle GitHub API rate limiting gracefully, displaying a countdown and cached data rather than an error state
- All GitHub tokens must be stored in the OS keychain (Electron `safeStorage`), never in plaintext config files
- The app must run on macOS (primary target); Windows and Linux are out of scope for v1
- The Electron app must not require elevated permissions

## Product Diagrams

Three primary views:

**1. Repository + PR List View** — Left sidebar lists configured repos. Main panel shows open PRs as cards with status badges. "Start Review" CTA on each card.

**2. Active Sessions View** — Sidebar tab showing all active worktree sessions with repo/PR label, disk size, and status indicator. Click to switch sessions.

**3. Session View** — Full-screen Claude Code conversation panel rooted in the worktree, with a persistent header showing PR number, branch, and worktree path. Cleanup/close button in header.

## Assumptions

- Users have Claude Code CLI installed and authenticated before first use; Arbor provides setup guidance but does not install it
- Users have `git` installed and available in PATH
- The host machine has already cloned the repositories being reviewed, or Arbor can perform a shallow clone on first use for a given repo
- GitHub OAuth App registration is handled by the app author (Jim) initially; a single OAuth App client ID can be distributed with the open-source repo
- Disk space management is the user's responsibility beyond the cleanup prompts Arbor provides
- The T3 Code fork provides a working Electron + Claude Code SDK foundation; Arbor does not need to rebuild agent session plumbing from scratch

## Out of Scope

- GitLab, Bitbucket, or Azure DevOps integration (GitHub only for v1)
- Posting review comments back to GitHub from within Arbor (v2 candidate)
- AI-automated PR summary or auto-review without user-initiated conversation
- Managing Claude Code credentials or API keys
- Windows or Linux support
- Team-level shared session state or collaborative review
- Branch creation or new feature development workflows (review-only in v1)
- Handling monorepo setups with multiple `package.json` roots differently from single-repo setups
- Any CI/CD integration or GitHub Actions triggering

## UX Designs

[TODO: Link to Figma or wireframes if created]

## Architecture / Diagrams

Arbor is a fork of `pingdotgg/t3code` with Arbor-specific features added as isolated modules. The T3 Code architecture (Electron shell + Node WebSocket server + React web app) is preserved.

```
[Electron Main Process]
  ├── GitHub OAuth IPC handler
  ├── Worktree Manager (simple-git)
  ├── CLAUDE.md Scaffolder
  └── Claude Code Session Launcher (inherited from T3 Code)

[React Renderer Process]
  ├── PR List View (Octokit → GitHub REST API)
  ├── Session Sidebar
  ├── CLAUDE.md Generation Modal
  └── Session View (Claude Code stream UI, inherited from T3 Code)

[Host Machine]
  ├── git CLI
  ├── Claude Code CLI (user-managed)
  └── ~/Code/{repo}/pr-{n}-{branch}/ (worktrees)
```

New bounded contexts added on top of T3 Code:

**GitHubContext** — OAuth token lifecycle, repo list management, PR list fetching and caching, refresh scheduling

**WorktreeContext** — Worktree creation, disk size tracking, cleanup orchestration, session-to-worktree mapping

**ReviewContextContext** — CLAUDE.md existence detection, template generation, write-to-worktree, skip/disable logic

## Infrastructure and Monitoring

**Infrastructure Impact:**

- Fully local application; no server infrastructure required
- GitHub API calls are client-side from the Electron main process; rate limit is 5,000 requests/hour per authenticated user (well within expected usage)
- Worktrees stored on local disk under user-configured path; no cloud storage

**Monitoring Strategy:**

- Local app logs written to `~/Library/Logs/Arbor/` (macOS standard)
- Startup health check results logged with actionable error codes
- GitHub API errors and rate limit events logged with timestamps
- No remote telemetry in v1; open question for v2

## Technical Approach

### Phase 1: Fork and Foundation

#### 1. [DOMAIN] Fork T3 Code and Establish Arbor Project Identity

1. **Depends On**: Nothing
2. **Description**: Fork `pingdotgg/t3code`, rename the app to Arbor, strip Codex-specific UI elements not needed for the review workflow, and verify the Claude Code adapter builds and runs end-to-end
3. **Implementation**:
   a. Fork repo to `{org}/worktree-session-manager`
   b. Update `package.json` app name, Electron `productName`, window title
   c. Verify Claude Code adapter PR (#179) is merged and functional; run local smoke test
   d. Remove or stub Codex-only UI paths to reduce noise during development
   e. Establish Arbor-specific directory structure:
   i. `apps/server/src/github/` — GitHub integration module
   ii. `apps/server/src/worktree/` — Worktree management module
   iii. `apps/server/src/review-context/` — CLAUDE.md scaffolding module
4. **Acceptance Criteria**:
   a. App launches as "Arbor" with no Codex references in visible UI
   b. A Claude Code session can be started against a manually specified local directory (baseline parity with T3 Code)
   c. Module directories exist with placeholder index files

### Phase 2: GitHub Integration

#### 2. [INTEGRATION][SERVICE] GitHub OAuth Authentication

1. **Depends On**: Task 1
2. **Description**: Implement GitHub OAuth Device Flow (no redirect URI needed — ideal for desktop apps) so any user can authenticate without configuring a callback URL. Store token in OS keychain via Electron `safeStorage`.
3. **Implementation**:
   a. Register a GitHub OAuth App with scopes: `repo` (read), `read:user`
   b. Implement Device Flow in Electron main process:
   i. POST to `https://github.com/login/device/code`
   ii. Display user code + verification URL in app (user opens browser, enters code)
   iii. Poll `https://github.com/login/oauth/access_token` until authorized
   c. Store token via `electron.safeStorage.encryptString` → write encrypted blob to app config file
   d. Expose IPC handlers: `github:authenticate`, `github:logout`, `github:getAuthStatus`
   e. On app launch, check for stored token and validate with `GET /user`
4. **Acceptance Criteria**:
   a. User can complete OAuth flow and see their GitHub username displayed in settings
   b. Token survives app restart without re-authentication
   c. Logout clears token from keychain and app config
   d. Invalid/expired token triggers re-authentication prompt rather than silent failure

#### 3. [SERVICE][UI] Repository Management and PR List

1. **Depends On**: Task 2
2. **Description**: Allow users to add GitHub repos by slug, persist the list, and fetch/display open PRs with status metadata
3. **Implementation**:
   a. Persist repo list to local JSON config file (e.g. `~/Library/Application Support/Arbor/repos.json`)
   b. Implement `GitHubService` using Octokit with methods:
   i. `listOpenPRs(owner, repo)` → returns PR cards with number, title, author, headBranch, createdAt, ciStatus, reviewStatus
   ii. `getPRDetails(owner, repo, number)` → full PR body and diff stat for CLAUDE.md generation
   c. Implement refresh scheduler (configurable interval, default 5 min) using `setInterval` in main process
   d. Cache last-fetched PR list in memory; serve cached data on renderer request while background refresh runs
   e. Build PR List React component:
   i. Repo selector in left sidebar
   ii. PR cards in main panel: number badge, title, author avatar, age, CI badge (green/red/yellow), review badge
   iii. "Start Review" button per card
   iv. Manual refresh button with last-refreshed timestamp
4. **Acceptance Criteria**:
   a. PRs from a configured repo appear within 3 seconds of app load (from cache or API)
   b. CI and review status badges accurately reflect GitHub state
   c. Repos can be added and removed from settings; list persists across restarts
   d. Rate limit errors display a countdown rather than a broken state

### Phase 3: Worktree Management

#### 4. [SERVICE] Worktree Manager

1. **Depends On**: Task 1
2. **Description**: Core service that handles git worktree lifecycle — create, list, measure, remove — using `simple-git`
3. **Implementation**:
   a. Implement `WorktreeService` with methods:
   i. `create(repoLocalPath, prBranch, prNumber)` → creates worktree at `{basePath}/{repoName}/pr-{number}-{branchSlug}`
   ii. `list()` → returns all tracked worktrees with metadata
   iii. `remove(worktreePath)` → runs `git worktree remove` and deletes directory
   iv. `getDiskSize(worktreePath)` → returns size in MB
   b. Persist active worktree registry to `~/Library/Application Support/Arbor/worktrees.json` with fields:

| Field         | Type              | Description                  |
| ------------- | ----------------- | ---------------------------- |
| id            | string / uuid     | Unique session identifier    |
| repo_slug     | string            | owner/repo                   |
| pr_number     | number            | GitHub PR number             |
| pr_title      | string            | PR title at time of creation |
| branch_name   | string            | Head branch name             |
| worktree_path | string            | Absolute path on disk        |
| created_at    | ISO 8601 datetime | When worktree was created    |
| last_active   | ISO 8601 datetime | Last time session was opened |

c. On create: fetch branch from origin before `git worktree add` to ensure it's current
d. Check for existing worktree for same PR before creating; return existing if found
e. Expose IPC handlers: `worktree:create`, `worktree:list`, `worktree:remove`, `worktree:getDiskSize` 4. **Acceptance Criteria**:
a. Worktree created at correct path with correct branch checked out
b. Re-selecting an already-open PR returns the existing session, not a new worktree
c. Removed worktrees are deleted from disk and from the registry
d. Disk size is displayed in the session list within 1 second of opening the list

#### 5. [UI] Session List and Session Switcher

1. **Depends On**: Task 4
2. **Description**: Sidebar view showing all active worktree sessions with status and management actions
3. **Implementation**:
   a. Add "Sessions" tab to sidebar alongside repo/PR list
   b. Each session card shows: repo name, PR number + title (truncated), branch name, disk size, created date, and status indicator (active/idle)
   c. Context menu (right-click) on session card: "Open Session", "Open in Windsurf/VS Code", "Copy Worktree Path", "Remove Worktree"
   d. "Open in Windsurf" shells out to `windsurf {worktreePath}` as an escape hatch for users who want their IDE directly
   e. Cleanup confirmation modal: "Remove worktree for PR #142? This will delete {path} ({size}MB). This cannot be undone."
4. **Acceptance Criteria**:
   a. All active sessions visible in sidebar with accurate metadata
   b. Clicking a session opens the Claude Code session view for that worktree
   c. Remove confirmation modal appears before deletion; no worktree is deleted without confirmation
   d. "Open in Windsurf" successfully opens the worktree directory in Windsurf

### Phase 4: CLAUDE.md Scaffolding

#### 6. [SERVICE] Review Context Scaffolder

1. **Depends On**: Tasks 3, 4
2. **Description**: Detects presence of CLAUDE.md in a worktree; if absent, runs `claude /init` to generate a repo-aware context file, then prepends a PR-specific header block
3. **Implementation**:
   a. Implement `ReviewContextService` with methods:
   i. `detect(worktreePath)` → returns `{ exists: boolean, path: string | null }`
   ii. `runInit(worktreePath)` → shells out to `claude /init` in the worktree directory; returns path to generated file
   iii. `prependPRHeader(filePath, prDetails, diffStat)` → reads file, prepends header block, writes back
   iv. `writePRHeaderOnly(worktreePath, prDetails, diffStat)` → used when /init is skipped; writes a minimal CLAUDE.md with only the PR header
   b. PR header block format prepended to top of file:

   ```markdown
   <!-- Arbor Review Context — do not commit -->

   # PR Review Session: #{number} — {title}

   **Author**: {author} | **Branch**: {branch} → {base} | **Review started**: {date}

   ## What Changed

   ## {git diff --stat output}
   ```

   c. Detection runs immediately after worktree creation, before session launch
   d. If `detect` returns `exists: true`: show non-blocking notice "Using existing CLAUDE.md" — no modification
   e. If `detect` returns `exists: false` and init setting is enabled: run `claude /init`, then prepend PR header
   f. If init setting is disabled: write PR header only via `writePRHeaderOnly`

4. **Acceptance Criteria**:
   a. Existing CLAUDE.md in repo is never modified or overwritten
   b. Generated file contains `claude /init` repo context with PR header block at the top
   c. PR header contains accurate number, title, author, branch names, and diff stat
   d. File is written only to the worktree root, not to the main repo checkout
   e. Comment `<!-- Arbor Review Context — do not commit -->` is present to signal to git hooks or the user that this file is ephemeral

#### 7. [UI] Review Context Progress and Skip Controls

1. **Depends On**: Task 6
2. **Description**: In-session UI feedback during the `claude /init` step, with the ability to skip if the user doesn't want it
3. **Implementation**:
   a. During worktree setup progress sequence, add step: "Initializing Claude context…" shown while `claude /init` runs
   b. If `/init` takes longer than 10 seconds, show a sub-label: "This may take a moment for large repos…"
   c. Add a "Skip context init" link that cancels the `/init` process and falls back to PR-header-only CLAUDE.md
   d. After successful init + header prepend, show a one-time dismissible notice in the session view header: "Review context initialized via /init — CLAUDE.md ready"
   e. Settings toggle: "Initialize Claude context on new review sessions" (default: on)
4. **Acceptance Criteria**:
   a. Progress step for `/init` is visible and advances to next step on completion
   b. Skip link cancels `/init` cleanly and proceeds to session launch with PR-header-only context
   c. Settings toggle persists and is respected on next session creation
   d. Notice in session header appears only once per session, not on every re-open

### Phase 5: Full Session Flow Integration

#### 8. [SERVICE][UI] End-to-End PR Review Flow

1. **Depends On**: Tasks 2, 3, 4, 5, 6, 7
2. **Description**: Wire all pieces into a single "Start Review" action that goes from PR card click to active Claude Code session
3. **Implementation**:
   a. "Start Review" button triggers this sequence:
   i. Check for existing worktree → if found, skip to step iv
   ii. Create worktree (`WorktreeService.create`)
   iii. Run CLAUDE.md detection + optional scaffolding (`ReviewContextService`)
   iv. Launch Claude Code session via T3 Code session infrastructure, rooted at worktree path
   v. Switch UI to Session View for the new/existing session
   b. Show progress indicator during worktree creation with step labels: "Fetching branch…", "Creating worktree…", "Setting up context…", "Starting Claude Code…"
   c. If Claude Code CLI health check fails at launch time, show inline error with link to installation docs rather than a broken session view
   d. Session View header must show: PR number, title, branch name, worktree path (copyable), and a "Close Session" button
4. **Acceptance Criteria**:
   a. Full flow from "Start Review" click to active Claude Code conversation completes in under 15 seconds on a machine with the branch already fetched
   b. Progress steps are visible and advance in order
   c. If worktree already exists, user lands in the existing session without duplication
   d. Claude Code session has correct working directory (`process.cwd()` inside session equals worktree path)
   e. Claude can read files from the worktree and answer questions about the PR branch code

### Phase 6: Settings and Polish

#### 9. [UI][SERVICE] Settings Screen

1. **Depends On**: Tasks 2, 4, 6
2. **Description**: Unified settings screen for all configurable behaviors
3. **Implementation**:
   a. Sections:
   i. **GitHub**: connected account display, disconnect button, re-authenticate button
   ii. **Repositories**: list of tracked repos with add (text input for slug) and remove (×) controls
   iii. **Worktrees**: base path picker, cleanup behavior toggle (prompt / manual only)
   iv. **Review Context**: CLAUDE.md behavior selector (always offer / always generate / never)
   v. **PR List**: refresh interval selector
   b. All settings persist to `~/Library/Application Support/Arbor/settings.json`
   c. Changes take effect immediately without restart (except base path, which applies to new worktrees only)
4. **Acceptance Criteria**:
   a. All settings persist across app restarts
   b. Changing cleanup behavior immediately affects subsequent close actions
   c. Base path change is reflected in worktree paths for all subsequently created sessions
   d. Re-authenticate flow works end-to-end when token is expired

#### 10. [SERVICE] Startup Health Check

1. **Depends On**: Task 1
2. **Description**: On every app launch, verify that required host dependencies are present and functional
3. **Implementation**:
   a. Check sequence on startup:
   i. `git --version` → verify git is in PATH
   ii. `claude --version` (or equivalent Claude Code CLI check) → verify CLI installed
   iii. GitHub token validation via `GET /user` → verify token present and valid
   b. Results displayed as a status strip at the bottom of the app (green/yellow/red per dependency)
   c. Red status items show an inline "Fix this" link:
   i. git not found → link to git installation docs
   ii. Claude Code not found → link to Claude Code installation docs
   iii. GitHub not authenticated → triggers OAuth flow
   d. App is fully usable even with yellow/red statuses except for the feature requiring the missing dependency
4. **Acceptance Criteria**:
   a. All three checks run within 2 seconds of app launch
   b. Status strip accurately reflects each dependency's state
   c. "Fix this" links resolve the issue when followed and the user returns to the app
   d. App does not crash or show blank screens when dependencies are missing

## Decisions

The following questions were resolved during PRD review:

1. **GitHub OAuth App Distribution**: GitHub Device Flow is the correct mechanism for a distributed desktop app. The client ID is safe to embed in the open-source repo — Device Flow does not expose the client secret. Register a GitHub OAuth App with scopes `repo` (read) and `read:user`. This is the canonical approach for open-source desktop tools.

2. **Clone Strategy**: Two distinct cases:
   - **PR List only**: No clone required. The app fetches PR metadata via GitHub API using only the OAuth token — no local repo needed to display the PR list.
   - **PR Review or Branch Collaboration**: Full clone (`git clone`) when the user initiates a worktree for the first time on a repo not yet cloned locally. Shallow clones (`--depth=1`) are explicitly rejected — they break `git worktree` with older branches and produce misleading diffs. Clone path: `{basePath}/{repoName}/.git-base/` (bare clone to support worktrees cleanly).

3. **CLAUDE.md Template**: Use `claude /init` (Claude Code's built-in init command) as the generation mechanism when no CLAUDE.md exists, rather than a custom template. This produces a repo-aware context file using Claude's own understanding of the codebase. The app triggers `/init` in the worktree after creation, then appends a PR-specific header block (PR number, title, author, diff stat) to the top of the generated file.

4. **Multi-window vs. Tab Model**: Retain Arbor's single-window tab model for v1. No multi-window support required. Users wanting side-by-side can open a second app instance.

5. **Lifecycle-Driven Cleanup**:
   - **PR Merged**: Auto-clean the worktree silently. No prompt. The work is done.
   - **PR Approved (not yet merged)**: Offer cleanup at the moment the approval status is detected during refresh. Show a non-blocking toast: "PR #142 was approved — clean up worktree?" with Accept / Later options.
   - **PR Closed without merge**: Treat same as merged — auto-clean.
   - **Manual cleanup**: Always available via session list context menu regardless of PR state.

## Open Questions / Concerns

1. **Bare Clone Directory UX**: The bare clone at `{basePath}/{repoName}/.git-base/` is invisible in Finder by default (dotfile prefix) but will appear in terminal. Should we use a non-hidden path like `{basePath}/{repoName}/_base/` for discoverability, or keep it hidden to reduce clutter?

2. **`/init` Output Quality on Large Repos**: `claude /init` on a large NestJS monorepo may produce a verbose or unfocused CLAUDE.md. We should test this against Second Nature's SNAPI repo before committing to it as the generation strategy. Fallback: use the handcrafted template from the original PRD draft.

3. **CLAUDE.md PR Header Append Safety**: Appending to a `/init`-generated CLAUDE.md requires careful placement (top of file, before repo context). Need to validate that Claude Code reads the full file and that the PR header doesn't confuse the context structure.
