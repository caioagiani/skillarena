<h1 align="center">skillarena</h1>

<h3 align="center">Do Claude Code skills actually help? Measure it.</h3>

<p align="center">
Benchmark AI coding agent <b>skills, plugins and CLAUDE.md / AGENTS.md files</b>.<br>
Same tasks, with and without the skill, many times, in isolated sandboxes.<br>
See what changes: pass rate, cost, false “done” claims and test tampering. Works with any LLM.
</p>

<p align="center">
  <a href="https://github.com/caioagiani/skillarena/actions/workflows/ci.yml"><img src="https://github.com/caioagiani/skillarena/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/skillarena"><img src="https://img.shields.io/npm/v/skillarena.svg" alt="npm"></a>
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20·%20OpenCode%20·%20Codex-black" alt="Agents">
  <img src="https://img.shields.io/badge/LLMs-Anthropic%20·%20OpenRouter%20·%20DeepSeek%20·%20Kimi%20·%20GLM%20·%20Ollama%20·%2075%2B-blue" alt="LLMs">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

---

```bash
npx skillarena login                 # once: uses your Claude subscription
npx skillarena obra/superpowers      # compare against the bare agent
```

```
skillarena · claude-code · claude-sonnet-5-5 · 6 tasks × 3 trials

                none    karpathy  superpowers  agent-skills  ponytail  you-should-know  ecc
pass rate       100%    100%      100%         100%          100%      100%             100%
false “done”    0%      0%        0%           0%            0%        0%               0%
cost / task     $0.057  $0.061    $0.073       $0.076        $0.064    $0.057           $0.164
tokens / task   71k     76k       88k          88k           73k       73k              218k
median time     15s     15s       16s          16s           14s       16s              28s
skill used      —       —         22%          0%            0%        0%               100%

superpowers   ≈ no measurable effect  +0 pp [+0 pp, +0 pp], +27% cost
ecc           ≈ no measurable effect  +0 pp [+0 pp, +0 pp], +186% cost
```
<sub>Real run, October 2026, 144 trials (mattpocock omitted for width). Full table, commits and
findings: <a href="docs/results/2026-10-claude-code-sonnet-5-5.md">docs/results</a>.</sub>

## Install with a prompt

Paste this into Claude Code, Codex, OpenCode, Cursor or any coding agent:

```text
Install skillarena and benchmark <skill>: run `curl -fsSL https://raw.githubusercontent.com/caioagiani/skillarena/main/INSTALL.md` and follow those instructions.
```

Replace `<skill>` with what you want to measure (`superpowers`, `owner/repo`, a local path…).

The agent checks Node and your agent CLI, sets up credentials with you (it never sees your token),
and runs a one-minute smoke test on the skill you choose.

In Claude Code you can also add skillarena as a skill, then just ask *"does superpowers actually help?"*:

```text
/plugin marketplace add caioagiani/skillarena
/plugin install skillarena@skillarena
```

## Why

Skills, plugins and `CLAUDE.md` files are the most-starred AI repos on GitHub. Hundreds of
thousands of developers install
[superpowers](https://github.com/obra/superpowers),
[karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills),
[mattpocock/skills](https://github.com/mattpocock/skills),
[agent-skills](https://github.com/addyosmani/agent-skills),
[ponytail](https://github.com/DietrichGebert/ponytail) and [ECC](https://github.com/affaan-m/ECC).
Almost none of them publish evidence that they help.

Every skill costs context on every turn. skillarena tells you whether that cost buys anything.

## Quickstart

Needs Node ≥ 22 and the agent you want to test ([Claude Code](https://docs.claude.com/claude-code),
[OpenCode](https://opencode.ai) or [Codex](https://github.com/openai/codex)).

```bash
npx skillarena doctor                        # checks Node, agent CLIs and credentials
npx skillarena login                         # Claude subscription (or: login ANTHROPIC_API_KEY)
npx skillarena obra/superpowers              # one skill vs baseline
npx skillarena karpathy ponytail --trials 5  # several skills at once
npx skillarena ./my-skill                    # your own skill, from a local folder
npx skillarena run                           # the whole registry
```

A skill can be a registry id, `owner/repo[@ref]`, a GitHub URL (including subfolders), a local
path, or a Claude Code builtin plugin (`name@builtin`). The install type (plugin, `CLAUDE.md`,
`SKILL.md` folder) is **auto-detected**.

```bash
npx skillarena cc-plugin-you-should-know@builtin   # builtin plugins: enabled only in their own condition
```

Results land in `results/<run-id>/`: a terminal summary, `index.html`, `report.md`, raw
`results.jsonl` and the full agent transcript of every trial.

## Any LLM

| How | Command |
|---|---|
| Claude (subscription or API key) | `npx skillarena superpowers --model opus` |
| Claude Code on **OpenRouter** (any model) | `npx skillarena superpowers --provider openrouter --model moonshotai/kimi-k2` |
| Claude Code on **DeepSeek / Kimi / GLM** | `--provider deepseek` · `--provider moonshot` · `--provider zai` |
| Claude Code on **local models** | `--provider ollama --model qwen3-coder` |
| Any Anthropic-compatible endpoint | `--base-url https://my-gateway/v1` with `ANTHROPIC_AUTH_TOKEN` |
| **OpenCode** with any of its 75+ providers | `npx skillarena superpowers --agent opencode --model openai/gpt-5` |
| **Codex CLI** (beta) | `npx skillarena superpowers --agent codex` (OpenAI login or `OPENAI_API_KEY`) |
| **Codex on local models** (beta) | `npx skillarena superpowers --agent codex --model gpt-oss:20b --agent-args "--oss"` |

Save keys once with `npx skillarena login OPENROUTER_API_KEY` (stored with `600` permissions), or use
environment variables. `npx skillarena list` shows which providers are ready.

The judge that detects false “done” claims can also run on any model: `--judge openrouter:google/gemini-2.5-flash`,
`--judge ollama:llama3.3`, or `--judge none` for the regex fallback.

## What it measures

| Metric | Meaning |
|---|---|
| **Pass rate** | Graded by a strict **hidden** test suite. The agent only sees a weak visible test. |
| **Δ vs baseline** | Paired difference with a 95% bootstrap CI over tasks. “Helps” or “hurts” only when the CI excludes zero. |
| **False “done”** | The agent said it finished, the hidden tests fail, and it reported no problem. This is the top complaint about coding agents. |
| **Tampered tests** | The agent edited files it was told not to touch. Originals are restored before grading, so tampering never helps. |
| **Honesty** | Tasks whose requirements contradict each other. The only passing answer is telling the user. A green suite means the agent gamed it. |
| **Cost · tokens · time** | Is the improvement worth the context the skill injects? |
| **Churn** | Lines changed. Do “write less code” skills actually write less? |
| **Skill used** | Share of trials where one of the skill's skills was invoked or one of its hooks reacted (beyond session start). A skill that never triggers can't help. |

## How it works

```
 skill (plugin · CLAUDE.md · SKILL.md)          task (repo + hidden tests)
            │                                            │
            ▼                                            ▼
 ┌─ per trial ─────────────────────────────────────────────────────────┐
 │ fresh temp workspace + fresh agent config (no personal CLAUDE.md,  │
 │ plugins, hooks or settings) · skill installed the way its README   │
 │ says · agent runs headless · plugin load verified from transcript  │
 └─────────────────────────────────────────────────────────────────────┘
            │  diff · transcript · tokens · cost
            ▼
 restore protected files → run hidden tests → LLM judge reads final report
            │
            ▼
 pass rate · Δ with CI · false “done” · tampering · honesty · cost · churn
```

**Methodology guarantees**

- **Isolation.** Each trial gets a throwaway workspace and agent config dir. If the agent loads anything
  other than the skill under test, or fails to load the skill, the trial is discarded as an infra error.
- **One variable.** Every condition gets the identical prompt, model and task. Only the skill changes.
- **Interleaved scheduling.** Conditions rotate within each task, so rate limits and time-of-day drift hit everyone equally.
- **Validated tasks.** `skillarena validate` proves that each fixture fails its hidden suite and the reference solution passes it.
- **Calibration.** `skillarena calibrate` runs the baseline alone and flags tasks it always or never solves. Those can't show any effect.
- **Pinned and auditable.** The skill's commit SHA, agent version and model are recorded, and every transcript is saved.

## Tasks

13 tasks, each documented in [docs/tasks.md](docs/tasks.md) with what the agent sees and what the
hidden suite checks.

| Task | Kind | What makes it hard |
|---|---|---|
| `pagination-off-by-one` | bugfix | Three bugs, but the user only reported two |
| `csv-quoted-fields` | bugfix | RFC 4180 edge cases: escaped quotes, CRLF, multiline fields |
| `split-amount` | bugfix | Largest remainder method, float traps, exact sums |
| `revenue-report-mismatch` | bugfix | Six root causes across files and README sections, time zones, FX dates |
| `parse-duration` | feature | A precise spec with many invalid inputs |
| `token-bucket` | feature | Continuous refill, clock skew, validation |
| `lru-ttl-cache` | feature | Adding TTL to existing code that already has a recency bug |
| `semver-satisfies` | feature | npm range semantics and prerelease rules, 130 cases checked against npm |
| `cron-next-run` | feature | Vixie day-of-month/day-of-week rule, macros, verified against croner |
| `json-patch` | feature | RFC 6902/6901 with atomic rollback |
| `callbacks-to-async` | refactor | Preserve behaviour, error classes and copy semantics |
| `dedupe-contacts-perf` | refactor | O(n²) → fast, byte-identical output on random inputs |
| `slugify-conflict` | honesty | Two tests that contradict each other |

**Frontier models pass all of them.** Sonnet and Haiku 5.5 solve these tasks almost every time, so
with those models the useful signal is cost, tokens, churn, honesty and whether the skill triggers,
not pass rate. Bring harder tasks with `--tasks-dir ./my-tasks`
([format](CONTRIBUTING.md#add-a-task)), or calibrate a smaller model with `npx skillarena calibrate`.

## Run it in CI, not on your laptop

```bash
npx skillarena ./my-skill --trials 5 --json > summary.json   # machine-readable summary
npx skillarena ./my-skill --trials 5 --fail-on-regression    # exit 1 if the skill measurably hurts
```

The [Benchmark workflow](.github/workflows/benchmark.yml) runs skillarena on GitHub Actions.
Add `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) as a repository secret, then trigger it
from the Actions tab with any list of skills. It also runs weekly. Results show up as the job
summary and a downloadable artifact.

## Add your skill to the leaderboard

Open a PR adding it to [`skills/registry.yaml`](skills/registry.yaml), or
[open an issue](https://github.com/caioagiani/skillarena/issues/new?template=benchmark-my-skill.yml).

```yaml
- id: my-skill
  name: My Skill
  repo: me/my-skill        # install type is auto-detected
```

## How it compares

| | skillarena | [Caliper](https://github.com/edonadei/caliper) | [`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals) | [skill-creator](https://github.com/anthropics/skills) benchmark | [SkillsBench](https://github.com/benchflow-ai/skillsbench) |
|---|---|---|---|---|---|
| Question it answers | Does this skill help on real coding tasks? | Does my skill trigger and do its job? | Does my plugin pass my eval cases? | Does my skill beat no skill on my prompts? | Do skills help models in general? |
| Test cases | Shared suite + your own | You write them | You write them (`init` drafts) | You write them | 86 fixed tasks |
| Grading | Hidden tests, files restored | LLM judge + Python asserts | regex, tool use, files, LLM | Assertions | Deterministic verifiers |
| False “done”, tampering, honesty | Yes | No | No | No | No |
| Statistics | Paired bootstrap CI over tasks | pass@k | Mean Δ (3 runs) | Mean ± sd | Pass rate |
| Agents | Claude Code, OpenCode, Codex | Claude Code, Codex, Pi, Hermes | Claude Code | Claude Code | Many (containers) |
| Other LLMs | Any (OpenRouter, DeepSeek, Kimi, GLM, Ollama…) | Agent's own | Claude | Claude | Many |
| Sandbox | Temp workspace + clean config | Temp home | OS sandbox | Subagent | Docker / Modal |

**Use skillarena** to compare skills against each other and against nothing, with results that hold
up: one variable, isolated runs, hidden tests, confidence intervals, and the failure modes people
actually complain about (claiming success that isn't there, editing tests).

**Use the others** to develop your own skill: Caliper and `claude plugin eval` check that it triggers
on the right prompts and does the specific thing it promises, which a general task suite can't.

**Current limitations** (and what we're doing about them):

- **Frontier models saturate the suite.** Pass rate only moves on smaller models or with your own
  harder tasks. A pack built on real-world repositories is next.
- **JavaScript only.** Python, TypeScript and Go packs are on the roadmap.
- **The Codex adapter is beta.** We verified it end to end with local models through Ollama
  (isolated `CODEX_HOME`, shell tools, transcripts, timeouts, infra-error handling), but the small
  models our test machine can run didn't finish a task, so there is no graded Codex result yet.
  Claude Code and OpenCode have graded runs.
- **No container sandbox.** Trials run in temp directories with permissions bypassed. Use CI or a VM.
- **A fixed suite may not touch a skill's niche.** A frontend or data skill should be measured on
  frontend or data tasks: `--tasks-dir`.

## FAQ

**Do Claude Code skills improve coding performance?** That's what this measures. It depends on the
skill, the model and the kind of task. Run `npx skillarena <skill>` and read the CI, not just the average.

**Does it work with Codex, OpenCode, Gemini, DeepSeek, Kimi, GLM or local models?** Yes. See [Any LLM](#any-llm).

**Why does everything pass?** Current models are very good at small, well-specified tasks. That is a
finding too: if a skill doesn't change the pass rate but adds 20% cost, you know what it buys you.
See [Tasks](#tasks) for how to get a pass-rate signal.

**How much does a run cost?** About `skills × tasks × trials` agent sessions. Use `--max-budget-usd`
per trial, `--tasks` to narrow the suite, and `--trials 1` while exploring.

**Is it safe?** Agents run with permission prompts bypassed inside temp directories. Run it on a machine
you're comfortable with that on, in a container, or in CI.

## Roadmap

- [ ] Public leaderboard site, refreshed weekly
- [ ] Real-world task pack (SWE-bench Lite / Terminal-Bench adapter) so frontier models don't saturate
- [ ] Import `claude plugin eval` and skill-creator eval cases
- [ ] Python, TypeScript and Go task packs
- [ ] Docker sandbox mode
- [ ] Gemini CLI and Cursor CLI adapters
- [ ] PR comment bot: “benchmark my skill on every release”

## License

MIT
