# Install skillarena (instructions for coding agents)

You are a coding agent helping a user install and run skillarena, a benchmark that measures
whether an agent skill, plugin or CLAUDE.md actually helps. Follow these steps in order and keep
the user posted with one short line per step. Do not install anything else.

1. **Check everything at once.** Run `npx -y skillarena@latest doctor`. It checks Node (22+), the
   agent CLIs (Claude Code, OpenCode, Codex) and credentials, including ones saved earlier by
   `skillarena login`. Don't check environment variables yourself: trust its output.

2. **Fix what it reports, one item at a time.**
   - Node older than 22: stop and tell the user to upgrade.
   - No agent CLI: suggest `npm i -g @anthropic-ai/claude-code` and ask before installing.
   - No Claude token: ask the user to run `npx skillarena login` in their own terminal (in Claude
     Code they can type `! npx skillarena login`). It is interactive and handles a secret: never run
     it for them and never ask them to paste the token to you. Then run `doctor` again.
   - Other LLMs: `npx skillarena login OPENROUTER_API_KEY` (or `DEEPSEEK_API_KEY`,
     `MOONSHOT_API_KEY`, `ZAI_API_KEY`, ...).

3. **Optional: the Claude Code skill.** If the user uses Claude Code, offer the skillarena skill
   so later they can just ask "does this skill help?". They run
   `/plugin marketplace add caioagiani/skillarena` and then `/plugin install skillarena@skillarena`.

4. **Smoke test.** Use the skill the user named in their request. Only if they named none, ask
   (a registry id from `npx skillarena list`, `owner/repo`, a GitHub URL, a local path or
   `name@builtin`), or fall back to `superpowers`. Run one quick trial with that skill:
   `npx -y skillarena@latest <skill> --tasks split-amount --trials 1`.
   It takes about a minute and costs a few cents. Show the summary table.

5. **Next step.** Tell the user the full comparison is `npx skillarena <skill> --trials 5`, how many
   agent sessions that is (skills × tasks × trials, 13 tasks by default), and that results land in
   `results/<run-id>/` with an HTML report and every transcript.
