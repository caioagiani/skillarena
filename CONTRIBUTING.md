# Contributing

## Add a skill to the leaderboard

Add an entry to [`skills/registry.yaml`](skills/registry.yaml) and open a PR. `install` can be
omitted: skillarena auto-detects plugins, `CLAUDE.md`/`AGENTS.md` files and `SKILL.md` folders.

## Add a task

A task is a folder in [`tasks/`](tasks/):

```
tasks/my-task/
  task.yaml      id, title, kind (bugfix|feature|refactor|honesty|workflow), prompt, test, protected
  repo/          what the agent sees, with a weak visible test
  hidden/        the grading tests, copied in only after the agent finishes
  solution/      reference fix, overlaid on repo/ by `validate`
```

Rules of thumb:

- The prompt reads like a real issue or request, not a test description.
- Hidden tests check only what the prompt, README or doc comments specify. No gotchas.
- `npm run build && node dist/cli.js validate --audit` must show ✓: the fixture fails, the solution
  passes, and an independent model finds every hidden test specified in the prompt or repo.
- Run `npx skillarena calibrate` and include the baseline pass rate in your PR. Tasks the baseline
  solves 100% of the time can't show a skill's effect.
- Document it in [docs/tasks.md](docs/tasks.md): the prompt, what the hidden suite checks, why it's hard.

### Workflow tasks (support, ops)

For skills that drive tools instead of editing code, `kind: workflow` tasks give the agent mock tools
over MCP. See [`examples/tasks/support-due-date`](examples/tasks/support-due-date):

```
my-task/
  task.yaml          kind: workflow; prompt is the customer's first message plus one line of context;
                     customer: { persona, maxTurns } for a simulated customer who answers the agent
  repo/              documents the agent can read (POLICY.md…)
  mock/tools.mjs     export const server = "billing"; export const tools = [{ name, description, inputSchema, run(args, db) }]
  mock/db.json       initial data the tools read and change
  hidden/*.test.js   read .skillarena-run/db.json, calls.jsonl, reply.md (all agent messages), conversation.json
  solution/calls.json + solution/reply.md   replayed by `validate`
```

Grade outcomes: the right records changed, the wrong ones untouched, and key facts in the reply.
A reply test may only require what the docs say the reply must contain, and only forbid what they
forbid. Workflow tasks run on Claude Code (`--mcp-config --strict-mcp-config`: the skill's own MCP
servers are never reached).

You don't need a PR to use your own tasks: `npx skillarena <skill> --tasks-dir ./my-tasks` runs any
folder with this layout, and `npx skillarena validate --tasks-dir ./my-tasks` checks it.

## Add an agent

Adapters live in [`src/agents/`](src/agents/). Implement `preflight`, `prepareWorkspace` (where the
agent discovers skills) and `run` (headless execution and transcript parsing), then add a parser
test to `test/unit.test.js`.

## Commits and releases

Commits (and PR titles, since PRs are squash-merged) follow [Conventional Commits](https://www.conventionalcommits.org).
They decide the next version automatically:

| Commit | Release |
|---|---|
| `fix: …` | patch |
| `feat: …` | minor |
| `feat!: …` or a `BREAKING CHANGE:` footer | major (minor while < 1.0) |
| `docs:` `chore:` `ci:` `test:` `refactor:` | no release |

[release-please](https://github.com/googleapis/release-please) keeps a release PR open with the version bump
and CHANGELOG. Merging it tags the release and publishes to npm with provenance.

## Development

```bash
npm install
npm test
node dist/cli.js --help
```
