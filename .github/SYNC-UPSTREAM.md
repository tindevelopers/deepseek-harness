# Sync upstream (one-way merge) GitHub Action

One workflow that one-way pulls upstream into the team fork's working branch `master`.

The team fork **never pushes to upstream**. It only pulls upstream commits down. Because `master` keeps the team's own custom commits, upstream changes are **merged** into `master` rather than fast-forwarded to match — this is a one-way pull, not a two-way sync. There is no `main` branch and no `master → main` propagate hop.

| File | Trigger | What it does |
|---|---|---|
| `.github/workflows/sync-upstream.yml` | Daily cron `0 2 * * *` and `workflow_dispatch` | Fetches upstream's default branch. If `master` is ahead of nothing new, does nothing. Otherwise merges upstream into `master`: **auto-merge (push) when the merge is clean**, open a `sync/upstream-<sha12>` → `master` PR **only when it conflicts**. |

Runs on `ubuntu-24.04` with `actions/checkout@v6`, no PR-listen. A concurrency group prevents overlapping runs.

## End-to-end pipeline

```
[schedule]                 [GitHub, automatic]
sync-upstream.yml   →    no new upstream → nothing to pull
                          │
                          └ new upstream → git merge upstream/<branch> into master
                                            ├ clean  → git push origin master   (auto-merged)
                                            └ conflict → open sync/upstream-<sha12> PR
                                                         (base master, head = upstream HEAD)

[conflict only, human]     [each machine]
resolve + merge the PR  →  devs git pull origin master  →  get upstream + team commits
```

- Clean upfront merges are **automatic** — no PR, no human.
- On a conflict, the workflow opens a PR and stops; a human resolves and merges.

## Merge behavior

| State | Action |
|---|---|
| `master` already contains all of upstream's commits (no new net changes) | Nothing to pull: no branch, no PR, no push. Logs `no new net changes from upstream; nothing to pull`. |
| `master` behind upstream, merge is **clean** | Merges upstream into `master` locally and `git push origin master` (auto-merged). Logs `auto-merged upstream ... into master`. |
| Merge **conflicts** with `master`'s custom commits | Aborts the merge, pushes a `sync/upstream-<sha12>` branch at upstream HEAD, and opens a PR titled `sync(upstream): resolve conflict merging <branch> into master (<sha12>)`. A human resolves and merges. |

The workflow never force-pushes and never rewrites `master`'s history; it only fast-forwards or adds a forward merge commit.

## Branch-name resolution

The upstream repo and its default branch resolve in this order:

1. `workflow_dispatch` input `upstream_repo` (manual override),
2. otherwise the default `deepseek-ai/deepseek-harness`.
3. The upstream default branch is discovered via `gh api repos/<upstream> --jq .default_branch`, falling back to `master`.

## Why auto-merge only when clean

A **clean** merge of upstream into `master` is unambiguous — there's nothing to decide, so it ships automatically. A **conflict** means upstream touched a file your custom commits also changed, which needs human judgment; that's the only case that must not be auto-resolved. Auto-merging *conflicted* merges is what previously buried bad resolutions in commit history, so this workflow never does that.

## Configuration

### Repo secret

| Name | Required | Purpose |
|---|---|---|
| `GH_TOKEN` | no (uses `GITHUB_TOKEN` by default) | A PAT if the default token lacks push/PR-write on a protected branch. |

## Branch protection on the team fork

Set on `tindevelopers/deepseek-harness` Settings → Branches → Branch protection rules → `master`:

- **Do not allow force pushes.** Required: the workflow never rewrites `master`.
- **Allow the `github-actions` bot to push clean merges.** Because the workflow auto-pushes `master` on a clean merge, the `github-actions[bot]` (or the account running the workflow) must be in **bypass actors**, or the clean-merge push will be rejected by a "require PR" rule. The conflict path opens a normal PR and still goes through review.

## Idempotency

The conflict path lists open PRs whose head matches the new sync branch before creating one, so re-running on the same drift state produces a single open PR. The auto-merge path is naturally idempotent (a fast-forward/merge push is one-shot).

## Concurrency

The workflow declares `concurrency: group: sync-upstream, cancel-in-progress: false`. Two scheduled runs cannot overlap.

## Rolling back a merge

A clean auto-merge is a forward commit or fast-forward on `master`. To roll back, `git revert` the merge commit, or `git reset --hard` with a force-push from a repo-admin PAT when you're certain no other merges happened in between (after temporarily loosening the no-force-push rule).

## Disabling or changing cadence

Edit `.github/workflows/sync-upstream.yml`:

- **Cadence:** change the `cron:` expression under `schedule:`.
- **Disable scheduled runs:** remove the `schedule:` block; manual `workflow_dispatch` runs still work.
