# Working with the team fork

This fork (`tindevelopers/deepseek-harness`) tracks upstream (`deepseek-ai/deepseek-harness`) on a 3-day cadence through the [Sync upstream](./.github/SYNC-UPSTREAM.md) GitHub Action. Each clone you create should talk to **this** fork as `origin`. Upstream stays one remote away.

## Clone from this fork

```sh
git clone git@github.com:tindevelopers/deepseek-harness.git
cd deepseek-harness
git remote -v
# origin  git@github.com:tindevelopers/deepseek-harness.git (fetch)
# origin  git@github.com:tindevelopers/deepseek-harness.git (push)
```

If you cloned from upstream by mistake:

```sh
git remote set-url origin git@github.com:tindevelopers/deepseek-harness.git
git fetch origin master
git checkout master
git reset --hard origin/master
```

## Recommended git config

```sh
git config --global pull.rebase true
git config --global branch.autosetuprebase always
git config --global rebase.autoStash true
```

This keeps each clone's history linear against the team fork's master. Without it, repeated pulls produce merge bubbles even when the system is "syncing cleanly".

## How upstream lands here

Two workflows in series:

1. **`.github/workflows/sync-upstream.yml`** runs `0 6 */3 * *` (every 3 days at 06:00 UTC) and on manual dispatch. Fast-forward drift becomes a sync PR titled `sync(upstream): bring master to <sha12>` against `master`. Non-fast-forward drift becomes an issue.
2. **`.github/workflows/sync-master-to-main.yml`** fires when the upstream sync PR is merged. If `main` is behind `master`, it opens a propagate PR titled `sync(master→main): bring main to <sha12>` against `main`.

Both PRs stop at human review. You do not need to fetch upstream yourself unless you are debugging a sync. The `sync/upstream-<sha12>` and `propagate/master-to-main-<sha12>` branches are short-lived and safe to ignore.

## Pre-push gates

This repo's `lefthook.yml` runs the `dsh-pre-push-checks` skill before push. Read [`.agents/skills/dsh-pre-push-checks/SKILL.md`](./.agents/skills/dsh-pre-push-checks/SKILL.md) for the gate list. The check vocabulary: focused tests for behavior, snapshots for model or user-facing output, `doc-sync` for docs, `test:snapshot:record` for re-recording after a model-visible change.

## Where fork-private content goes

| Intent | Home |
|---|---|
| Custom droid (a named agent behavior) | `.factory/droids/<name>.md` |
| Custom skill (loaded into droid by name) | `.agents/skills/<name>/SKILL.md` |
| Long-lived rationale, accepted trade-offs | `.agents/notes/<kind>/<date>-<title>.md` |
| Project conventions and agent-facing intent | root `AGENTS.md` extension for fork-private additions only; otherwise let upstream drive |

## What not to add at root

Do not invent new top-level files like `intent.md`, `our-config.md`, `deepseek-<anything>.md` for fork-private content. The conventions above already give every fact one home. A root-level stray becomes hard to find six months from now and confuses both humans and agents picking up the repo cold.

## When in doubt

If the harness says "this is the home for X" in `AGENTS.md`, that home wins. Otherwise, fork-private additions belong under `.factory/droids/`, `.agents/skills/`, or `.agents/notes/` — not at the repo root.
