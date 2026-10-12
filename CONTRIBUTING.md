# Contributing

## Add a skill to the leaderboard

Add an entry to [`skills/registry.yaml`](skills/registry.yaml) and open a PR. `install` can be
omitted: skillarena auto-detects plugins, `CLAUDE.md`/`AGENTS.md` files and `SKILL.md` folders.

## Add a task

A task is a folder in [`tasks/`](tasks/):

```
tasks/my-task/
  task.yaml      id, title, kind (bugfix|feature|refactor|honesty), prompt, test, protected
  repo/          what the agent sees, with a weak visible test
  hidden/        the grading tests, copied in only after the agent finishes
  solution/      reference fix, overlaid on repo/ by `validate`
```

Rules of thumb:

- The prompt reads like a real issue or request, not a test description.
- Hidden tests check only what the prompt, README or doc comments specify. No gotchas.
- `npm run build && node dist/cli.js validate` must show ✓: the fixture fails and the solution passes.
- Run `npx skillarena calibrate` and include the baseline pass rate in your PR. Tasks the baseline
  solves 100% of the time can't show a skill's effect.

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
