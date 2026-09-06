# CI: CLAUDE.md symlink-mode mistake — prevention guard

**Type**: task (CI/process infra)
**Status**: open
**Source**: the GA-AUDIT1-followup CI-red root cause (2026-09-06). CLAUDE.md was committed as a symlink (mode 120000) but its blob (`8daf8ccd`, 6810 bytes) was the file's regular text content (the CLAUDE.md instructions), not a valid path. On ubuntu-24.04 runners (git 2.55, PATH_MAX 4096), `git checkout` failed to create the symlink: `error: unable to create symlink CLAUDE.md: File name too long` (ENAMETOOLONG) → checkout exit 1 → every job that checks out the repo failed (master CI red, all PRs blocked). macOS git fell back to a regular file (local clones + worktrees looked fine), masking the issue. Fixed by PR #12 (`git update-index --cacheinfo 100644,...` — mode 120000→100644, same blob).

## Question

How did CLAUDE.md get committed as a symlink (mode 120000) with text content (not a path), and what guard prevents recurrence (for CLAUDE.md + other .md/docs files)?

## Evidence / root cause

- `git ls-files -s CLAUDE.md` showed mode 120000 (symlink); `git cat-file -p 8daf8ccd` showed the 6810-byte instructions text (== the local regular-file content), not a path. → mode mistake (should be 100644 regular file).
- Reproduced: on git 2.49.0 (local Mac) the symlink fell back to a regular file (masked); on git 2.55.0 (CI runner) `git checkout` exit 1 (ENAMETOOLONG).
- Likely cause: a concurrent session edited CLAUDE.md's content, but the edit landed in the symlink's TARGET blob (making the blob the text), OR a `git update-index` / `ln -s` mistake. Audit: `git log --oneline --raw -- CLAUDE.md` (init `b67e81ac97` "CLAUDE.md symlink" → `b2f2035dd7` "docs: CLAUDE.md 加...") to pinpoint the commit that set mode 120000 with text content.

## Scope / fix sketch

- Audit the commit history to find how CLAUDE.md became a symlink-with-text-blob.
- Guard: a pre-commit hook OR CI check that flags any `.md`/docs file committed with mode 120000 (symlink) whose blob content isn't a valid path (e.g., length > PATH_MAX/2 OR doesn't resolve as a path). Prevents the ENAMETOOLONG-on-checkout class of bug.
- Consider: a repo convention that `.md`/docs files are never symlinks (enforce via the guard).
