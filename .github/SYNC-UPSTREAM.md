# Sync upstream (one-way merge) GitHub Action

One workflow that one-way pulls upstream into the team fork's working branch `master`.

The team fork **never pushes to upstream**. It only pulls upstream commits down. Because `master` keeps the team's own custom commits, upstream changes are **merged** into `master` rather than fast-forwarded to match — this is a one-way pull, not a two-way sync. There is no `main` branch and no `master → main` propagate hop.

| File | Trigger | What it does |
|---|---|---|
| `.github/workflows/sync-upstream.yml` | Daily cron `0 2 * * *` and `workflow_dispatch` | Fetches upstream's default branch. If `master` is behind, opens one merge PR (`sync/upstream-<sha12>` → `master`) whose head is upstream HEAD. |

Runs on `ubuntu-24.04` with `actions/checkout@v6`, no PR-listen, no auto-merge. A concurrency group prevents overlapping runs.

## End-to-end pipeline

```
[schedule]                    [human review]
sync-upstream.yml  →   sync/upstream-<sha12> PR →  master receives upstream
                          (base master, head = upstream HEAD)
                                                       │
                                                       ▼
                                                      devs git pull origin master
                                                       get upstream + team commits
```

Each boundary is gated on a human review: the workflow opens the PR, CI runs, a human clicks merge. No automatic merges.

## Merge behavior

| State | Action |
|---|---|
| `master` at or ahead of upstream | Silent. |
| `master` behind upstream (with or without custom commits ahead) | Pushes a `sync/upstream-<sha12>` branch at upstream HEAD and opens a PR titled `sync(upstream): one-way merge <branch> into master (<sha12>)` against `master`. |
| Merge has conflicts | The PR shows them; a human resolves in the PR and merges. |

Because the PR head is upstream HEAD and the base is `master`, it **fast-forwards** cleanly when the fork has no custom commits ahead, and **merges** (possibly with conflicts) when it does. Either way it's a single merge of upstream into `master`.

The workflow **never** merges to `master` itself. Humans click the merge button on the PR after CI passes.

## Branch-name resolution

The upstream repo and its default branch resolve in this order:

1. `workflow_dispatch` input `upstream_repo` (manual override),
2. otherwise the default `deepseek-ai/deepseek-harness`.
3. The upstream default branch is discovered via `gh api repos/<upstream> --jq .default_branch`, falling back to `master`.

## Why no auto-merge

Auto-merging upstream changes into a team's working fork has caused this project's own history to ship a string of "post-rebase fix" commits. This workflow stops at "open the PR" so status checks on the PR branch become the real gate.

## Configuration

### Repo secret (optional)

| Name | Required | Purpose |
|---|---|---|
| `GH_TOKEN` | no (uses `GITHUB_TOKEN` by default) | A PAT if the default token lacks PR-write on a protected branch. |

## Branch protection on the team fork

Set on `tindevelopers/deepseek-harness` Settings → Branches → Branch protection rules → `master`:

- **Require a pull request before merging.** The workflow never pushes to `master`; only humans merge.
- **Require status checks to pass before merging.** Pick at least one check from the PR's own CI.
- **Do not allow force pushes.** Required: the sync branches must not be rewritten in place.
- **Do not include the bot in bypass actors.**

## Idempotency

`Open one-way merge PR` first lists open PRs whose head matches the new sync branch. If one is already open, the step skips creation. Re-running on the same drift state therefore produces a single open PR.

## Concurrency

The workflow declares `concurrency: group: sync-upstream, cancel-in-progress: false`. Two scheduled runs cannot overlap.

## Rolling back a merge

The head branch is at upstream HEAD, so a merged PR may be a fast-forward or a real merge. To roll back, revert the sync PR against `master` (`git revert`), or `git reset --hard` with a force-push from a repo-admin PAT when you're certain no other merges happened in between.

## Disabling or changing cadence

Edit `.github/workflows/sync-upstream.yml`:

- **Cadence:** change the `cron:` expression under `schedule:`.
- **Disable scheduled runs:** remove the `schedule:` block; manual `workflow_dispatch` runs still work.
