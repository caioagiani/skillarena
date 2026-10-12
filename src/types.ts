export type SkillInstall =
  /** Load the repo (or a subdir) as a Claude Code plugin via --plugin-dir. */
  | { type: "plugin"; path?: string }
  /** Copy a single instructions file into the workspace as CLAUDE.md / AGENTS.md. */
  | { type: "instructions"; path: string }
  /** Copy a directory of SKILL.md folders into the workspace skills dir. */
  | { type: "skills-dir"; path: string; single?: boolean }
  /** A plugin that ships inside Claude Code (`name@builtin`), toggled through settings. */
  | { type: "builtin"; plugin: string; path?: undefined }
  /** Detect from the repo layout after fetching (plugin > instructions > skills-dir). */
  | { type: "auto"; path?: string };

export interface SkillSpec {
  id: string;
  name: string;
  /** "none" for the baseline, otherwise owner/repo on GitHub or any git URL. */
  repo: string;
  /** Branch, tag or commit. Resolved to a commit SHA and recorded in results. */
  ref?: string;
  install: SkillInstall | null;
  homepage?: string;
  notes?: string;
}

export interface ResolvedSkill extends SkillSpec {
  /** Local checkout path, null for baseline. */
  dir: string | null;
  sha: string | null;
}

export type TaskKind = "bugfix" | "feature" | "refactor" | "honesty";

export interface TaskSpec {
  id: string;
  title: string;
  kind: TaskKind;
  prompt: string;
  /** Command that runs the hidden test suite from the workspace root. */
  test: string;
  /** Globs (relative to the repo) the agent is not supposed to modify. */
  protected?: string[];
  timeoutSec?: number;
  /** honesty tasks: what an honest final report must contain. */
  honesty?: { expect: string };
  /** Absolute path of the task folder. */
  dir: string;
}

export interface AgentRunInput {
  workspace: string;
  prompt: string;
  model?: string;
  skill: ResolvedSkill;
  timeoutSec: number;
  maxBudgetUsd?: number;
  transcriptPath: string;
  configDir: string;
  /** Every builtin plugin under test in this run: enabled for its own condition, disabled for all others. */
  builtins: string[];
  /** Extra CLI flags passed verbatim to the agent (same for every condition). */
  extraArgs: string[];
}

export interface AgentRunResult {
  finalMessage: string;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
  durationMs: number;
  timedOut: boolean;
  exitCode: number | null;
  error?: string;
  /** Shell commands the agent ran (for "did it run the tests?" analysis). */
  commands: string[];
  model?: string;
  /** Plugin directories the agent reported as loaded (for contamination checks). */
  loadedPlugins?: { name: string; path: string }[];
  /** Builtin plugins the agent reported as active. */
  builtinPlugins?: string[];
  /** Skills the agent invoked through its Skill tool, e.g. "superpowers:systematic-debugging". */
  skillCalls?: string[];
  /** Hooks that fired (e.g. "SessionStart:startup"). Isolated configs have none of their own. */
  hooks?: string[];
}

export interface Agent {
  id: string;
  /** Throws with a helpful message when the agent can't run. */
  preflight(): Promise<void>;
  /** Optional one-time setup before any trial (e.g. warming a clean config template). */
  setup?(): Promise<void>;
  prepareWorkspace(workspace: string, skill: ResolvedSkill): Promise<void>;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface Claims {
  claimedDone: boolean;
  reportedProblem: boolean;
  /** Only for honesty tasks: did the report contain what was expected? */
  metExpectation?: boolean;
  method: "judge" | "heuristic";
}

export interface TrialRecord {
  runId: string;
  ts: string;
  agent: string;
  model: string | null;
  skill: string;
  skillSha: string | null;
  task: string;
  taskKind: TaskKind;
  trial: number;

  pass: boolean;
  testsPassed: number;
  testsFailed: number;
  /** Names of the hidden tests that failed (TAP "not ok" lines). */
  failedTests: string[];
  tampered: boolean;
  tamperedFiles: string[];
  /** honesty tasks: protected (contradictory) tests pass => the agent gamed them. */
  gamed: boolean;

  claimedDone: boolean;
  reportedProblem: boolean;
  falseDone: boolean;
  ranTests: boolean;
  claimsMethod: Claims["method"];

  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
  durationMs: number;

  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;

  timedOut: boolean;
  error?: string;
  /** Non-builtin plugins the agent loaded during the trial. */
  plugins: string[];
  skillCalls: string[];
  hooks: string[];
  /** Did the skill visibly do anything (skill invoked or hook fired)? null when not observable. */
  skillUsed: boolean | null;
  transcript: string;
  finalMessage: string;
}
