#!/usr/bin/env bash
#
# check-team-fork-update.sh
#
# SessionStart hook: tell the session when this clone is behind the team fork,
# so a programmer learns about new code the moment they start working.
#
# The team fork (tindevelopers/deepseek-harness) is the release channel: its
# `master` is where upstream is merged on a weekly schedule. A clone compares
# against that remote's `master`, never against upstream directly.
#
# Notify-only by default. Never writes the working tree, never creates a merge
# commit, and never blocks the session. Set DSH_TEAM_FORK_AUTOPULL=1 to also
# fast-forward a clean clone; `--ff-only` cannot clobber local work.
#
# Output: JSON on stdout when behind, silence when current or unreachable.
# Always exits 0 so a missing network cannot break session start.

set -uo pipefail

# Only run inside a Git work tree. SessionStart fires in whatever directory the
# session starts, which is not always this repository.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Resolve the remote holding the team fork. `origin` is the documented layout;
# an upstream-only clone has nothing to compare, so stay silent.
remote=""
for candidate in origin tindevelopers; do
  if git remote get-url "$candidate" >/dev/null 2>&1; then
    remote="$candidate"
    break
  fi
done
[ -n "$remote" ] || exit 0

branch="master"

# Consume the hook payload without blocking when stdin is a terminal.
if [ ! -t 0 ]; then
  payload=$(cat 2>/dev/null || true)
  case "$payload" in
    *'"source":"compact"'*|*'"source": "compact"'*) exit 0 ;;
  esac
fi

# Cache the last fetch in the git directory (outside the work tree, so the
# repository stays clean) and reuse it for TTL seconds. This keeps session
# start fast and avoids hammering the remote across frequent sessions.
git_dir=$(git rev-parse --git-dir 2>/dev/null) || exit 0
cache_file="$git_dir/dsh-team-fork-last-check"
ttl="${DSH_TEAM_FORK_CHECK_TTL:-21600}" # 6 hours
now=$(date +%s)
behind=""

if [ -f "$cache_file" ]; then
  cached_at=$(cut -d' ' -f1 "$cache_file" 2>/dev/null || echo 0)
  cached_behind=$(cut -d' ' -f2 "$cache_file" 2>/dev/null || echo "")
  case "$cached_at" in ''|*[!0-9]*) cached_at=0 ;; esac
  if [ $((now - cached_at)) -lt "$ttl" ] && [ -n "$cached_behind" ]; then
    behind="$cached_behind"
  fi
fi

if [ -z "$behind" ]; then
  # Fetch quietly with no credential prompt. A TCP connect to an unreachable
  # remote ignores http.lowSpeedLimit (that bounds transfer speed, not connect),
  # so bound the wait here instead: poll for at most fetch_wait seconds, then
  # leave the fetch running in the background and report from the previous
  # cache. The fetch is never killed, so it cannot leave stale Git lock files.
  GIT_TERMINAL_PROMPT=0 git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 \
    fetch --quiet --no-tags --prune "$remote" "$branch" >/dev/null 2>&1 &
  fetch_pid=$!
  fetch_wait="${DSH_TEAM_FORK_FETCH_WAIT:-8}"
  waited=0
  while kill -0 "$fetch_pid" 2>/dev/null; do
    if [ "$waited" -ge "$fetch_wait" ]; then
      if [ -n "${cached_behind:-}" ]; then
        behind="$cached_behind"
        break
      fi
      exit 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  if [ -z "$behind" ]; then
    wait "$fetch_pid" 2>/dev/null || exit 0

    target="$remote/$branch"
    git rev-parse --verify --quiet "$target" >/dev/null 2>&1 || exit 0

    behind=$(git rev-list --count "HEAD..$target" 2>/dev/null) || exit 0
    case "$behind" in ''|*[!0-9]*) exit 0 ;; esac
    printf '%s %s\n' "$now" "$behind" >"$cache_file" 2>/dev/null || true
  fi
fi

[ "$behind" -gt 0 ] 2>/dev/null || exit 0

# Opt-in fast-forward for a clean clone. --ff-only refuses when local commits
# or uncommitted changes would be lost, so the worst case is a no-op.
if [ "${DSH_TEAM_FORK_AUTOPULL:-0}" = "1" ]; then
  if [ -z "$(git status --porcelain 2>/dev/null)" ] \
    && git merge --ff-only --quiet "$remote/$branch" >/dev/null 2>&1; then
    printf '%s %s\n' "$now" 0 >"$cache_file" 2>/dev/null || true
    exit 0
  fi
fi

head_short=$(git rev-parse --short HEAD 2>/dev/null || echo '?')
target_short=$(git rev-parse --short "$remote/$branch" 2>/dev/null || echo '?')

# additionalContext is appended to the new session context. Keep it to the
# facts a reader needs to act.
read -r -d '' context <<EOF || true
This clone is $behind commit(s) behind the team fork ($remote/$branch at $target_short; local HEAD $head_short).
Team code arrives on the fork's master weekly. Before starting work, update with:
    git pull --ff-only $remote $branch
Report this to the user if the task depends on recently merged code.
EOF

python3 - "$context" <<'PY' 2>/dev/null || true
import json
import sys

print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": sys.argv[1].strip(),
}}))
PY

exit 0
