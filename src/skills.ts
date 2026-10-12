import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import type { ResolvedSkill, SkillInstall, SkillSpec } from "./types.js";
import { exec, log } from "./util.js";

export const BASELINE: SkillSpec = { id: "none", name: "No skill (baseline)", repo: "none", install: null };

export async function loadRegistry(file: string): Promise<SkillSpec[]> {
  const doc = YAML.parse(await readFile(file, "utf8")) as { skills: SkillSpec[] };
  const skills = doc.skills ?? [];
  const ids = new Set<string>();
  for (const s of skills) {
    if (!s.id || !s.repo) throw new Error(`Invalid skill entry in ${file}: ${JSON.stringify(s)}`);
    if (ids.has(s.id)) throw new Error(`Duplicate skill id "${s.id}" in ${file}`);
    ids.add(s.id);
    if (s.repo !== "none" && !s.install) s.install = { type: "auto" };
  }
  if (!ids.has("none")) skills.unshift(BASELINE);
  return skills;
}

/**
 * Turn a CLI argument into a skill: a registry id, `owner/repo[@ref]`, a GitHub URL
 * (optionally `/tree/<ref>/<subdir>`), or a local path.
 */
export function parseSkillArg(arg: string, registry: SkillSpec[]): SkillSpec {
  const known = registry.find((s) => s.id === arg);
  if (known) return known;

  if (/^[\w.-]+@builtin$/.test(arg)) {
    const id = arg.replace(/@builtin$/, "").replace(/^cc-plugin-/, "");
    return { id, name: arg, repo: "builtin", install: { type: "builtin", plugin: arg } };
  }

  if (arg.startsWith(".") || arg.startsWith("/") || arg.startsWith("~")) {
    const abs = path.resolve(arg.replace(/^~(?=\/|$)/, os.homedir()));
    if (!existsSync(abs)) throw new Error(`Path not found: ${abs}`);
    const id = path.basename(statSync(abs).isDirectory() ? abs : path.dirname(abs));
    return { id, name: id, repo: abs, install: { type: "auto" } };
  }

  const url = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)\/?(.*))?$/.exec(arg);
  if (url) {
    const [, owner, repo, ref, sub] = url;
    return { id: sub ? path.basename(sub) : repo, name: `${owner}/${repo}`, repo: `${owner}/${repo}`, ref, install: { type: "auto", path: sub || undefined } };
  }

  const short = /^([\w.-]+)\/([\w.-]+)(?:@(.+))?$/.exec(arg);
  if (short) {
    const [, owner, repo, ref] = short;
    const byRepo = registry.find((s) => s.repo.toLowerCase() === `${owner}/${repo}`.toLowerCase());
    if (byRepo && !ref) return byRepo;
    return { id: repo, name: `${owner}/${repo}`, repo: `${owner}/${repo}`, ref, install: { type: "auto" } };
  }

  throw new Error(`Can't understand skill "${arg}". Use a registry id, owner/repo, a GitHub URL or a local path.`);
}

/** Work out how a skill is meant to be installed from its files. */
export function detectInstall(dir: string, sub = ""): SkillInstall {
  const root = path.join(dir, sub);
  const has = (p: string) => existsSync(path.join(root, p));
  if (statSync(root).isFile()) {
    if (/SKILL\.md$/i.test(root)) return { type: "skills-dir", path: path.dirname(sub) === "." ? "" : path.dirname(sub), single: true };
    return { type: "instructions", path: sub };
  }
  if (has(".claude-plugin/plugin.json")) return { type: "plugin", path: sub || undefined };
  if (has("SKILL.md")) return { type: "skills-dir", path: sub, single: true };
  if (has("CLAUDE.md")) return { type: "instructions", path: path.join(sub, "CLAUDE.md") };
  if (has("AGENTS.md")) return { type: "instructions", path: path.join(sub, "AGENTS.md") };
  if (has("skills")) return { type: "skills-dir", path: path.join(sub, "skills") };
  if (has(".claude/skills")) return { type: "skills-dir", path: path.join(sub, ".claude/skills") };
  throw new Error(`Couldn't detect how to install ${root}: no .claude-plugin/plugin.json, SKILL.md, CLAUDE.md, AGENTS.md or skills/ found.`);
}

function cacheRoot(): string {
  return process.env.SKILLARENA_CACHE ?? path.join(os.homedir(), ".cache", "skillarena");
}

function repoUrl(repo: string): string {
  if (/^(https?:|git@|file:)/.test(repo)) return repo;
  return `https://github.com/${repo}.git`;
}

async function git(args: string[], cwd: string): Promise<string> {
  const r = await exec("git", args, { cwd, timeoutSec: 300 });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

function finalize(spec: SkillSpec, dir: string, sha: string | null): ResolvedSkill {
  let install = spec.install!;
  if (install.type === "auto") {
    install = detectInstall(dir, install.path ?? "");
    log.info(`  ${spec.id}: detected ${install.type}${install.path ? ` (${install.path})` : ""}`);
  }
  const target = path.join(dir, install.path ?? "");
  if (!existsSync(target)) throw new Error(`Skill "${spec.id}": install path not found: ${target}`);
  return { ...spec, install, dir, sha };
}

/** Fetch a skill (shallow, cached) and pin its commit SHA. Local paths are used in place. */
export async function resolveSkill(spec: SkillSpec, opts: { refresh?: boolean } = {}): Promise<ResolvedSkill> {
  if (spec.repo === "none" || !spec.install) return { ...spec, dir: null, sha: null };
  if (spec.install.type === "builtin") return { ...spec, dir: null, sha: "builtin" };

  if (path.isAbsolute(spec.repo)) {
    const dir = statSync(spec.repo).isDirectory() ? spec.repo : path.dirname(spec.repo);
    const sha = await git(["rev-parse", "HEAD"], dir).catch(() => "local");
    const s = statSync(spec.repo).isFile() && spec.install.type === "auto" ? { ...spec, install: { type: "auto" as const, path: path.basename(spec.repo) } } : spec;
    return finalize(s, dir, sha);
  }

  const ref = spec.ref ?? "HEAD";
  const dir = path.join(cacheRoot(), "skills", `${spec.repo.replace(/[^\w.-]/g, "_")}@${ref.replace(/[^\w.-]/g, "_")}`);
  const pinned = /^[0-9a-f]{40}$/.test(ref);

  if (!(existsSync(path.join(dir, ".git")) && (pinned || !opts.refresh))) {
    log.info(`  fetching ${spec.repo}@${ref}`);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await git(["init", "-q"], dir);
    await git(["remote", "add", "origin", repoUrl(spec.repo)], dir);
    await git(["fetch", "-q", "--depth", "1", "origin", ref], dir);
    await git(["checkout", "-q", "FETCH_HEAD"], dir);
  }
  return finalize(spec, dir, await git(["rev-parse", "HEAD"], dir));
}
