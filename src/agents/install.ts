import { existsSync } from "node:fs";
import { copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ResolvedSkill } from "../types.js";

export interface InstallLayout {
  /** Where instruction files go, e.g. CLAUDE.md or AGENTS.md. */
  instructionsFile: string;
  /** Folder the agent scans for SKILL.md folders, relative to the workspace. */
  skillsDir: string;
  /** "native": the agent loads plugins itself (flag at run time). "copy": approximate by copying files. */
  plugins: "native" | "copy";
}

/** Install a skill into a workspace the way the target agent discovers it. */
export async function installSkill(workspace: string, skill: ResolvedSkill, layout: InstallLayout): Promise<void> {
  if (!skill.install || !skill.dir) return;
  const src = path.join(skill.dir, skill.install.path ?? "");
  const skillsTarget = path.join(workspace, layout.skillsDir);
  const copySkills = async (from: string, single: boolean) => {
    const to = single ? path.join(skillsTarget, skill.id) : skillsTarget;
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, filter: (f) => !f.includes(`${path.sep}.git`) });
  };

  switch (skill.install.type) {
    case "instructions":
      await copyFile(src, path.join(workspace, layout.instructionsFile));
      break;
    case "skills-dir":
      await copySkills(src, Boolean(skill.install.single));
      break;
    case "plugin":
      if (layout.plugins === "native") break;
      if (existsSync(path.join(src, "skills"))) await copySkills(path.join(src, "skills"), false);
      for (const f of ["AGENTS.md", "CLAUDE.md"]) {
        if (existsSync(path.join(src, f))) {
          await copyFile(path.join(src, f), path.join(workspace, layout.instructionsFile));
          break;
        }
      }
      break;
    case "auto":
      throw new Error(`skill "${skill.id}" was not resolved`);
  }
}
