---
name: skillarena
description: Benchmark whether an agent skill, plugin or CLAUDE.md file actually improves a coding agent, using the skillarena CLI. Use when the user asks if a skill or plugin "helps", wants to compare skills, or wants to measure their own skill before publishing it.
---

# skillarena

skillarena runs a coding agent headless on a fixed suite of tasks, with and without a skill, in
throwaway workspaces and config dirs, and grades every attempt with hidden tests. It reports the
pass rate difference with a confidence interval, cost, false "done" claims, test tampering and
whether the skill was used at all.

## Before running

1. Run `npx -y skillarena@latest doctor`. It checks Node 22+, the agent CLIs and credentials
   (including ones saved earlier by `skillarena login`). Trust it over your own env checks.
2. If it says there is no Claude token, the user must run `npx skillarena login` **themselves**
   (it is interactive and prints a secret). Tell them to type `! npx skillarena login` in this
   session. Never ask them to paste the token into the chat.
3. Cost. A run is `skills × tasks × trials` agent sessions (a few cents to ~$0.20 each on Sonnet).
   Say the number of sessions before starting anything larger than a smoke test.

## Run

Smoke test first (1 task, 1 trial, about a minute):

```bash
npx -y skillarena@latest <skill> --tasks split-amount --trials 1
```

Then the real comparison:

```bash
npx -y skillarena@latest <skill> [<skill> ...] --trials 5
```

`<skill>` is a registry id (`npx skillarena list`), `owner/repo[@ref]`, a GitHub URL (subfolders
work), a local path, or a Claude Code builtin plugin as `name@builtin`. Useful flags: `--model`,
`--tasks a,b`, `--agent opencode|codex`, `--provider openrouter --model <id>`, `--max-budget-usd`,
`--json`.

Runs take a while. Start them in the background and check the output file instead of blocking.
An interrupted run resumes with `--run-id <id>`.

## Read the result

- `▲ helps` / `▼ hurts` only when the 95% interval excludes zero. `≈ no measurable effect` means
  the data can't tell, not that the skill is useless: more trials or harder tasks may.
- If the baseline already passes ~100%, pass rate can't improve. Compare cost, tokens, churn and
  false "done" instead, or run `npx skillarena calibrate --model <model>` to find tasks with room.
- `skill used 0%` means the skill never triggered during the tasks. That is often the real finding.
- Every transcript is in `results/<run-id>/transcripts/`. Open a few before concluding anything.

Report the numbers with their intervals and the cost difference. Don't round "no measurable
effect" up to "helps".
