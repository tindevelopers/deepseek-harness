# Working with the team fork

This fork (`tindevelopers/deepseek-harness`) is the release channel the team consumes. Its `master` is where upstream (`deepseek-ai/deepseek-harness`) is merged on a weekly schedule, so every clone tracks **this** fork as `origin` and keeps upstream one remote away as `upstream`.

## Clone from this fork

```sh
git clone git@github.com:tindevelopers/deepseek-harness.git
cd deepseek-harness
git remote -v
# origin  git@github.com:tindevelopers/deepseek-harness.git (fetch)
# origin  git@github.com:tindevelopers/deepseek-harness.git (push)
```

Add upstream once, for the rare times you need to inspect it directly:

```sh
git remote add upstream https://github.com/deepseek-ai/deepseek-harness
git remote -v
# origin    git@github.com:tindevelopers/deepseek-harness.git (fetch)
# origin    git@github.com:tindevelopers/deepseek-harness.git (push)
# upstream  https://github.com/deepseek-ai/deepseek-harness (fetch)
# upstream  https://github.com/deepseek-ai/deepseek-harness (push)
```

If you cloned from upstream by mistake, repoint `origin` at the fork:

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

## How new code reaches a clone

Two halves, one weekly cycle.

**The fork is brought current.** [`.github/workflows/sync-upstream.yml`](./.github/workflows/sync-upstream.yml) runs `30 6 * * MON` (Mondays 06:30 UTC) and on manual dispatch. A clean merge of upstream into `master` is pushed automatically, with a Mattermost notice; a conflicting merge opens a `sync/upstream-<sha12>` PR for human resolution and stops there. See [`.github/SYNC-UPSTREAM.md`](./.github/SYNC-UPSTREAM.md).

**A clone is told it is behind.** [`.factory/hooks.json`](./.factory/hooks.json) registers a `SessionStart` hook running [`.factory/hooks/check-team-fork-update.sh`](./.factory/hooks/check-team-fork-update.sh). On session start it fetches `origin/master`, and when the clone is behind it appends the commit count, both SHAs, and the exact update command to the session context. It is notify-only, never writes the working tree, and stays silent when current, offline, or outside a work tree.

| Variable | Default | Effect |
|---|---|---|
| `DSH_TEAM_FORK_AUTOPULL` | `0` | `1` fast-forwards a clean clone instead of only notifying. `--ff-only` refuses when local commits or uncommitted changes would be lost. |
| `DSH_TEAM_FORK_CHECK_TTL` | `21600` | Seconds a fetch result is reused, keeping frequent session starts off the network. |
| `DSH_TEAM_FORK_FETCH_WAIT` | `8` | Seconds to wait for the fetch before leaving it running in the background and reporting from cache. |

Update a clone by hand at any time:

```sh
git pull --ff-only origin master
```

## Pre-push gates

This repo's `lefthook.yml` runs the `dsh-pre-push-checks` skill before push. Read [`.agents/skills/dsh-pre-push-checks/SKILL.md`](./.agents/skills/dsh-pre-push-checks/SKILL.md) for the gate list. The check vocabulary: focused tests for behavior, snapshots for model or user-facing output, `doc-sync` for docs, `test:snapshot:record` for re-recording after a model-visible change.

## Where fork-private content goes

| Intent | Home |
|---|---|
| Custom droid (a named agent behavior) | `.factory/droids/<name>.md` |
| Session lifecycle automation | `.factory/hooks.json` plus `.factory/hooks/*.sh` |
| Custom skill (loaded into droid by name) | `.agents/skills/<name>/SKILL.md` |
| Long-lived rationale, accepted trade-offs | `.agents/notes/<kind>/<date>-<title>.md` |
| Project conventions and agent-facing intent | root `AGENTS.md` extension for fork-private additions only; otherwise let upstream drive |

## What not to add at root

Do not invent new top-level files like `intent.md`, `our-config.md`, `deepseek-<anything>.md` for fork-private content. The conventions above already give every fact one home. A root-level stray becomes hard to find six months from now and confuses both humans and agents picking up the repo cold.

## When in doubt

If the harness says "this is the home for X" in `AGENTS.md`, that home wins. Otherwise, fork-private additions belong under `.factory/droids/`, `.factory/hooks/`, `.agents/skills/`, or `.agents/notes/` — not at the repo root.
