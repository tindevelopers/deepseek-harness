# Shared team skills (off-premises mirror)

These are the team's shared skills, mirrored from the on-premises NAS
(`/Volumes/AiProgramming/Setup For IDE's/DeepSeek-Harness/dsh-config/agent-skills/skills/`) so programmers
who are **not** on the office network get them by cloning this repository.
The NAS server is `FBPxNAS`; the `AiProgramming` share mounts at `/Volumes/AiProgramming/`.

DSH discovers them automatically as this project's `project-dsh` skill root
(`<repo>/.dsh/skills`) when a session runs inside this repository — no NAS mount
or `DSH_AGENTS_HOME` needed.

## Updating

The NAS is the canonical source. Re-copy from the NAS into this directory, or
edit directly and commit — both paths are git-tracked and travel to everyone who
clones.

See the NAS runbook at `/Volumes/AiProgramming/Setup For IDE's/DeepSeek-Harness/dsh-config/README.md`
for the full setup (skills, default model, credential, machine wiring).
