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
skillarena · claude-code · claude-sonnet-5-5 · 8 tasks × 3 trials

                      none (base)   skill-a       skill-b
csv-quoted-fields     67%           100% +33      67%
lru-ttl-cache         33%           67% +33       33%
slugify-conflict      0%            67% +67       33% +33
…
──────────────────────────────────────────────────────────
pass rate             71%           88% +17       75% +4
false “done”          13%           4%            8%
tampered tests        4%            0%            0%
cost / task           $0.121        $0.198        $0.130
churn (lines)         64            81            49

skill-a       ▲ helps  +17 pp [+4 pp, +29 pp], +64% cost
skill-b       ≈ no measurable effect  +4 pp [-8 pp, +13 pp], +7% cost
```
<sub>Output format with made-up numbers for two hypothetical skills. Not a result: run it yourself.</sub>

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
| **Codex CLI** | `npx skillarena superpowers --agent codex` |

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

| Task | Kind | What makes it hard |
|---|---|---|
| `pagination-off-by-one` | bugfix | Three bugs, but the user only reported two |
| `csv-quoted-fields` | bugfix | RFC 4180 edge cases: escaped quotes, CRLF, multiline fields |
| `split-amount` | bugfix | Largest remainder method, float traps, exact sums |
| `parse-duration` | feature | A precise spec with many invalid inputs |
| `token-bucket` | feature | Continuous refill, clock skew, validation |
| `lru-ttl-cache` | feature | Adding TTL to existing code that already has a recency bug |
| `callbacks-to-async` | refactor | Preserve behaviour, error classes and copy semantics |
| `slugify-conflict` | honesty | Two tests that contradict each other |

Want harder tasks or other languages? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Run it in CI, not on your laptop

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

## skillarena vs Caliper

[Caliper](https://github.com/edonadei/caliper) is great for **skill authors**: write a spec for
your own skill, check that it triggers on the right prompts, and run it against your real setup.
skillarena is for **comparing skills**: a fixed task suite, isolated from your personal config,
with honesty and tampering metrics, so results are comparable across skills and models.

## FAQ

**Do Claude Code skills improve coding performance?** That's what this measures. It depends on the
skill, the model and the kind of task. Run `npx skillarena <skill>` and read the CI, not just the average.

**Does it work with Codex, OpenCode, Gemini, DeepSeek, Kimi, GLM or local models?** Yes. See [Any LLM](#any-llm).

**How much does a run cost?** About `skills × tasks × trials` agent sessions. Use `--max-budget-usd`
per trial, `--tasks` to narrow the suite, and `--trials 1` while exploring.

**Is it safe?** Agents run with permission prompts bypassed inside temp directories. Run it on a machine
you're comfortable with that on, in a container, or in CI.

## Roadmap

- [ ] Public leaderboard site, refreshed weekly
- [ ] Harder tasks: multi-file features, ambiguous specs, SWE-bench Lite adapter
- [ ] Python, TypeScript and Go task packs
- [ ] Docker sandbox mode
- [ ] Gemini CLI and Cursor CLI adapters
- [ ] PR comment bot: “benchmark my skill on every release”

## License

MIT
