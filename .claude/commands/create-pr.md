# Create Pull Request Command

Create a pull request that conforms to the team's PR standards, with automatic JIRA ticket extraction and PR type inference from commits.

## Arguments

$ARGUMENTS

## Argument Parsing

Arguments are passed via `$ARGUMENTS`. Parse as follows:

| Argument Type | Format        | Example                     |
| ------------- | ------------- | --------------------------- |
| Flags         | `--flag-name` | `--draft`                   |
| Key-Value     | `--key=value` | `--title="My custom title"` |
| Positional    | Plain text    | `SNP-12345`                 |

**Supported Arguments:**

- `--draft` - Create as draft PR
- `--title="..."` - Override the PR title (must still include ticket number)
- `--base=branch` - Target branch (default: `main`)
- `SNP-XXXXX` - Explicit JIRA ticket number (overrides branch detection)

**Error Handling:**

- Unrecognized flags: Warn and continue
- Invalid ticket format: Reject with helpful message

## Instructions

### Step 1: Verify Prerequisites

```bash
# Check gh CLI is installed and authenticated
gh --version
gh auth status
```

If `gh` is not installed or authenticated:

> "GitHub CLI (`gh`) is required. Install via `brew install gh` and run `gh auth login`."

### Step 2: Extract JIRA Ticket Number

**Priority order for ticket number:**

1. Explicit argument (e.g., `/create-pr SNP-12345`)
2. Branch name extraction (e.g., `SNP-12345-feature-name` → `SNP-12345`)

```bash
# Get current branch name
git branch --show-current
```

**Extraction rules:**

- Match pattern: `SNP-\d+` (case-insensitive)
- Branch MUST start with the ticket number
- Valid: `SNP-12345-add-feature`, `snp-12345-bugfix`
- Invalid: `feature-SNP-12345`, `main`

**If no valid ticket found:**

> "Branch name must start with a JIRA ticket number (e.g., `SNP-12345-feature-name`).
> Current branch: `[branch-name]`
>
> Either:
>
> 1. Rename your branch: `git branch -m SNP-XXXXX-your-description`
> 2. Provide ticket explicitly: `/create-pr SNP-XXXXX`"

Stop execution if no ticket can be determined.

### Step 3: Check for Existing PR

```bash
# Check if PR already exists for this branch
gh pr view --json url,state 2>/dev/null
```

If PR exists:

- If open: "A PR already exists for this branch: [URL]. Use `gh pr edit` to modify it."
- If closed/merged: Warn but allow creating new PR

### Step 4: Gather Commit Information

```bash
# Get commits unique to this branch (not in main)
git log main..HEAD --oneline

# Get detailed commit messages for analysis
git log main..HEAD --format="%s%n%b---"

# Get diff stats for context
git diff main...HEAD --stat
```

### Step 5: Infer PR Type from Commits

Analyze commit messages to suggest PR type(s). Look for keywords:

| PR Type       | Keywords in Commits                                            |
| ------------- | -------------------------------------------------------------- |
| Feature       | `add`, `new`, `implement`, `create`, `introduce`               |
| Bug Fix       | `fix`, `bug`, `issue`, `resolve`, `correct`, `patch`           |
| Documentation | `doc`, `readme`, `comment`, `jsdoc`                            |
| Style         | `style`, `format`, `lint`, `prettier`, `eslint`                |
| Refactor      | `refactor`, `restructure`, `reorganize`, `clean`, `simplify`   |
| Performance   | `perf`, `optimize`, `speed`, `cache`, `lazy`                   |
| Test          | `test`, `spec`, `coverage`, `mock`                             |
| CI            | `ci`, `pipeline`, `workflow`, `github action`, `deploy`        |
| Chore         | `chore`, `release`, `version`, `bump`, `dependency`, `upgrade` |
| Revert        | `revert`                                                       |

**Selection logic:**

1. Scan all commit subjects for keywords (case-insensitive)
2. Count matches for each type
3. Select type(s) with matches (can be multiple)
4. Default to "Feature" if no clear signals

### Step 6: Generate PR Title

Format: `SNP-XXXXX: <description>`

**Title generation priority:**

1. If `--title` provided: Use it (validate it contains ticket number)
2. If single commit: Use commit subject (without any existing ticket prefix)
3. If multiple commits: Use the first commit subject or summarize

```bash
# Get first commit subject for title candidate
git log main..HEAD --format="%s" | tail -1
```

**Clean up title:**

- Remove any existing `SNP-XXXXX:` prefix from commit message (avoid duplication)
- Capitalize first letter
- Keep under 72 characters

### Step 7: Generate PR Description

Use this template, filling in the detected values:

```markdown
## What type of PR is this?

[SELECTED_TYPES]

## Branch and Pull Request naming convention

Ensure your branch name and pull request title start with Jira ticket number: `[TICKET_NUMBER]`.

## Describe your changes

[COMMIT_SUMMARY]

## Jira Link

https://secondnature.atlassian.net/browse/[TICKET_NUMBER]

## Is there a feature flag for this PR? If yes, list the name of the flag.

<!-- Add feature flag name if applicable -->

## What gif best describes this PR or how it makes you feel? [GIFs for GitHub](https://chromewebstore.google.com/detail/gifs-for-github/dkgjnpbipbdaoaadbdhpiokaemhlphep)

[GIF_IMAGE]
```

**For [SELECTED_TYPES]:**

Only include the matching types from the analysis. Format as:

```markdown
- [emoji] Type Name
```

Where emoji mapping is:

- Feature → `- :pizza: Feature`
- Bug Fix → `- :bug: Bug Fix`
- Documentation → `- :memo: Documentation Update`
- Style → `- :art: Style`
- Refactor → `- :technologist: Code Refactor`
- Performance → `- :fire: Performance Improvements`
- Test → `- :white_check_mark: Test`
- CI → `- :repeat: CI`
- Chore → `- :package: Chore (Release)`
- Revert → `- :fast_forward: Revert`

**For [COMMIT_SUMMARY]:**

- If 1-3 commits: List each commit message as a bullet point
- If 4+ commits: Group by type or provide high-level summary
- Include file change statistics

Example output:

```markdown
## Describe your changes

- Add new lease validation service
- Implement unit tests for lease validator
- Update lease entity with new fields

**Changes:** 5 files changed, 234 insertions(+), 12 deletions(-)
```

**For [GIF_IMAGE]:**

Use WebFetch to get a random GIF from Giphy based on the PR type. Use this mapping for search terms:

| PR Type       | Giphy Search Term       |
| ------------- | ----------------------- |
| Feature       | `new feature excited`   |
| Bug Fix       | `bug squash victory`    |
| Documentation | `documentation writing` |
| Style         | `beautiful clean`       |
| Refactor      | `cleaning organizing`   |
| Performance   | `speed fast rocket`     |
| Test          | `testing quality check` |
| CI            | `automation robot`      |
| Chore         | `maintenance cleanup`   |
| Revert        | `undo reverse`          |

**Fetch a random GIF:**

Use WebFetch to search Giphy and extract a GIF URL:

```
WebFetch: https://giphy.com/search/[SEARCH_TERM]
Prompt: "Find a fun, work-appropriate GIF URL from the search results. Return just the direct GIF embed URL in markdown format: ![gif](URL)"
```

Alternatively, use one of these curated fallback GIFs if fetch fails:

| PR Type  | Fallback GIF                                                                |
| -------- | --------------------------------------------------------------------------- |
| Feature  | `![ship it](https://media.giphy.com/media/143vPc6b08locw/giphy.gif)`        |
| Bug Fix  | `![bug](https://media.giphy.com/media/l3q2zbskZp2j8wniE/giphy.gif)`         |
| CI       | `![automation](https://media.giphy.com/media/3o7qE1YN7aBOFPRw8E/giphy.gif)` |
| Refactor | `![clean](https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif)`      |
| Default  | `![coding](https://media.giphy.com/media/ZVik7pBtu9dNS/giphy.gif)`          |

### Step 8: Confirm with User

Before creating the PR, show:

```
=== Pull Request Preview ===

Title: SNP-12345: Add lease validation service

Type(s): Feature, Test

Base: main ← [current-branch]

Description preview:
[First 10 lines of description]
...

Ready to create this PR?
```

Use the AskUserQuestion tool:

**Options:**

1. "Create PR" - Proceed with creation
2. "Create as Draft" - Create as draft PR
3. "Edit title" - Let user modify title
4. "Cancel" - Abort

### Step 9: Create the Pull Request

```bash
# Create the PR using gh CLI with HEREDOC for body
gh pr create \
  --title "[TITLE]" \
  --base "[BASE_BRANCH]" \
  [--draft if requested] \
  --body "$(cat <<'EOF'
[FULL_DESCRIPTION]
EOF
)"
```

### Step 10: Report Success

After successful creation:

```
PR created successfully!

[PR_URL]

Title: [TITLE]
Base: [BASE] ← [HEAD]
Status: [Open/Draft]

Next steps:
- Add reviewers: gh pr edit --add-reviewer @username
- View PR: gh pr view --web
- Check status: gh pr checks
```

## Error Handling

| Error                    | Response                                                        |
| ------------------------ | --------------------------------------------------------------- |
| Not on a feature branch  | "You're on `main`. Create a feature branch first."              |
| No commits ahead of main | "No commits to create PR for. Make some changes first."         |
| Branch not pushed        | Auto-push with `git push -u origin [branch]` after confirmation |
| gh auth failure          | "Please authenticate: `gh auth login`"                          |
| PR creation failure      | Show gh error message and suggest fixes                         |

## Examples

```bash
# Basic usage - auto-detect everything
/create-pr

# Explicit ticket number
/create-pr SNP-28889

# Create as draft
/create-pr --draft

# Custom title
/create-pr --title="SNP-28889: Implement new lease validation"

# Different base branch
/create-pr --base=develop
```
