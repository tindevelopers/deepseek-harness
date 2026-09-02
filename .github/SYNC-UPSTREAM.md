# Sync upstream + propagate GitHub Actions

Two companion workflows that keep the team fork's `master` byte-for-byte aligned with upstream, and keep the team working branch `main` updated against `master`.

| File | Trigger | What it does |
|---|---|---|
| `.github/workflows/sync-upstream.yml` | Scheduled cron `0 6 */3 * *` and `workflow_dispatch` | Detects drift between the team fork's `master` and upstream's default branch. Opens a sync PR (`sync/upstream-<sha12>` → `master`) for human review. Files an issue if drift is non-fast-forward. |
| `.github/workflows/sync-master-to-main.yml` | Fires when an upstream-sync PR is merged into `master` | Detects `main` behind `master`. Opens a propagate PR (`propagate/master-to-main-<sha12>` → `main`) for human review. |

Both run on `ubuntu-24.04` with `actions/checkout@v6`, no PR-listen, no auto-merge. Concurrency groups prevent overlap.

## End-to-end pipeline

```
[schedule]                  [human review]              [human review]
sync-upstream.yml       →   sync/upstream-<sha12>   →   master receives upstream
                             PR merged into master
                                                          │
                                                          │ (closed event)
                                                          ▼
[trigger]                                              [human review]
sync-master-to-main.yml →   propagate/master-to-main- →  main receives master
                             <sha12> PR into main
                                                          │
                                                          ▼
                                                         devs git pull origin main
                                                          get upstream + team work
```

Each boundary is gated on a human review: the workflow opens the PR, CI runs, a human clicks merge. No automatic merges.

## Behavior by drift type (sync-upstream.yml)

| Drift state | Action |
|---|---|
| `none` (`<branch>` already at upstream) | Silent. |
| `fast-forward` (behind > 0, ahead = 0) | Pushes a `sync/upstream-<sha12>` branch and opens a PR titled `sync(upstream): bring <branch> to <sha12> (<upstream>)` against the target branch. Slack notified. |
| `diverged` (behind > 0, ahead > 0) | Opens an issue titled `drift: diverged from <upstream> on <branch>`. Slack notified. |

The workflow **never** merges to the target branch. Humans click the merge button on sync PRs after CI passes.

## Branch-name coupling

The team fork's target branch is resolved in this order, so a rename on upstream's side is followed automatically:

1. `workflow_dispatch` input `<target_branch_override>` (manual pin), then
2. `vars.UPSTREAM_DEFAULT_BRANCH` (operator override, optional), then
3. `gh api repos/<upstream> --jq .default_branch` discovers the upstream's actual default branch.

If both forks have the same default-branch name today (`master` at time of writing), leaving the repo variable unset is correct. If upstream ever renames its default, the first scheduled run after the rename will follow it. The only time to set the variable is when the upstream's default is renamed and you want to **stay** on the old name on the team fork — that scenario is unusual and worth flagging in an issue rather than silently living in config.

## Why no auto-merge

Auto-merging upstream changes into a team's working fork has caused this project's own history to ship a string of "post-rebase fix" commits (`fix: align mode-value prose and stale persistent mentions with the split`, `fix: repair merged README remnants and note links after the master rebase`). That trail is what happens when merges skip review and gates. This workflow stops at "open the PR" so status checks on the PR branch become the real gate.

## Configuration

### Repo variable (optional)

| Name | Default | Purpose |
|---|---|---|
| `UPSTREAM_REPO` | `deepseek-ai/deepseek-harness` | GitHub `<owner>/<repo>` to fetch and compare against. Override via Settings → Secrets and variables → Actions → Variables. |
| `UPSTREAM_DEFAULT_BRANCH` | (auto) | Pin the target branch on this fork. By default the workflow queries `gh api repos/<upstream>` for the upstream's default branch. Set this only if you want to hold the team fork on a different branch name than upstream's. |

The `workflow_dispatch` input `upstream_repo`, when supplied, takes precedence over the variable. The same rule applies to the `target_branch` input above `UPSTREAM_DEFAULT_BRANCH`.

### Repo secret (optional)

| Name | Required | Purpose |
|---|---|---|
| `SLACK_WEBHOOK_URL` | no | Slack incoming-webhook URL. If unset, the Slack step exits silently on every run. Create one in Slack: Apps → Incoming Webhooks. |

## Branch protection on the team fork

Set on `tindevelopers/deepseek-harness` Settings → Branches → Branch protection rules → `master`:

- **Require a pull request before merging.** The workflow never pushes to `master`; only humans merge.
- **Require status checks to pass before merging.** Pick at least one check from the workflow's own status (e.g., the contributor's own CI on the sync branch). Pin the check name after the first successful run.
- **Do not allow force pushes.** Required: the workflow's fast-forward branches must not be rewritten in place.
- **Do not include the bot in bypass actors.** The bot should not be allowed to skip required checks.

The workflow runs with `GITHUB_TOKEN` by default and writes only to `sync/upstream-<sha12>` branches.

## Idempotency

`Open sync PR` first lists open PRs whose head matches the new sync branch. If one is already open, the step skips creation. Re-running the workflow on the same drift state therefore produces a single open PR, not duplicates.

## Concurrency

The workflow declares `concurrency: group: sync-upstream, cancel-in-progress: false`. Two scheduled runs cannot overlap; the second waits for the first to finish.

## Rolling back a sync

Sync PRs are fast-forward. To roll back:

- **Soft:** open a revert PR against `master`, or revert in the existing sync PR.
- **Hard:** `git reset --hard <previous-tag>` on `master`, then force-push with `--force-with-lease` (this requires temporarily loosening branch protection's "no force push" rule, or pushing from a repo-admin PAT). Only do this if you're certain no other merges happened in between.

The `sync/upstream-<sha12>` branches are intentionally short-lived. Delete them after the sync PR merges to keep the branches view clean.

## Disabling or changing cadence

Edit `.github/workflows/sync-upstream.yml`:

- **Cadence:** change the `cron:` expression under `schedule:`. The team's house style for cron uses Asia/Shanghai (per `dependabot.yml`); if you'd rather use it, pick a non-overlapping minute and timezone, e.g., `30 4 */3 * *` (04:30 Asia/Shanghai daily schedules already run at minute `:0` for dependabot).
- **Disable scheduled runs:** remove the `schedule:` block. Manual runs in `workflow_dispatch` still work.
- **Disable Slack notifications:** unset `SLACK_WEBHOOK_URL` in the repo's secrets, and the notification step will skip silently.
