import type { SkillSummary, Summary } from "./report.js";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = c("1");
export const dim = c("2");
export const green = c("32");
export const red = c("31");
export const yellow = c("33");
export const cyan = c("36");

// eslint-disable-next-line no-control-regex
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;
const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - visible(s)));

const pct = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "—" : `${Math.round(x * 100)}%`);
const pts = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)} pp`;

function verdict(k: SkillSummary, base: SkillSummary | undefined): string {
  const d = k.delta;
  const costPart =
    base?.costMean && k.costMean != null
      ? `, ${Math.round((k.costMean / base.costMean - 1) * 100) >= 0 ? "+" : ""}${Math.round((k.costMean / base.costMean - 1) * 100)}% cost`
      : base && base.tokensMean
        ? `, ${Math.round((k.tokensMean / base.tokensMean - 1) * 100) >= 0 ? "+" : ""}${Math.round((k.tokensMean / base.tokensMean - 1) * 100)}% tokens`
        : "";
  if (!d || Number.isNaN(d.delta)) return dim("no baseline to compare");
  const range = dim(`[${pts(d.lo)}, ${pts(d.hi)}]`);
  if (d.lo > 0) return `${green("▲ helps")}  ${pts(d.delta)} ${range}${costPart}`;
  if (d.hi < 0) return `${red("▼ hurts")}  ${pts(d.delta)} ${range}${costPart}`;
  return `${yellow("≈ no measurable effect")}  ${pts(d.delta)} ${range}${costPart}`;
}

function cell(v: number | undefined, base: number | undefined, isBase: boolean): string {
  if (v == null) return dim("—");
  const s = pct(v);
  if (isBase || base == null) return s;
  const d = Math.round((v - base) * 100);
  if (d === 0) return s;
  return `${s} ${d > 0 ? green(`+${d}`) : red(String(d))}`;
}

/** Caliper-style side-by-side comparison, one column per skill. */
export function printSummary(s: Summary, meta: { trials?: number } = {}): void {
  const base = s.skills.find((k) => k.skill === s.baseline);
  const cols = s.skills;
  const labelW = Math.max(22, ...s.tasks.map((t) => t.length + 2));
  const colW = Math.max(14, ...cols.map((k) => k.skill.length + 2));
  const out: string[] = [];
  const row = (label: string, cells: string[]) => out.push(pad(label, labelW) + cells.map((x) => pad(x, colW)).join(""));

  out.push("");
  out.push(
    `${bold("skillarena")} ${dim("·")} ${s.agent}${s.model ? ` ${dim("·")} ${s.model}` : ""} ${dim("·")} ${s.tasks.length} tasks${meta.trials ? ` × ${meta.trials} trials` : ""}`,
  );
  out.push("");
  row("", cols.map((k) => bold(k.skill === s.baseline ? `${k.skill} ${dim("(base)")}` : k.skill)));
  for (const t of s.tasks) row(dim(t), cols.map((k) => cell(k.perTask[t], base?.perTask[t], k === base)));
  out.push(dim("─".repeat(labelW + colW * cols.length)));
  row(bold("pass rate"), cols.map((k) => bold(cell(k.passRate, base?.passRate, k === base))));
  row("false “done”", cols.map((k) => (k.falseDoneRate > 0 ? yellow(pct(k.falseDoneRate)) : pct(k.falseDoneRate))));
  row("tampered tests", cols.map((k) => (k.tamperRate > 0 ? red(pct(k.tamperRate)) : pct(k.tamperRate))));
  row("honesty", cols.map((k) => pct(k.honestyPassRate)));
  row("cost / task", cols.map((k) => (k.costMean == null ? dim("—") : `$${k.costMean.toFixed(3)}`)));
  row("tokens / task", cols.map((k) => (Number.isNaN(k.tokensMean) ? "—" : `${Math.round(k.tokensMean / 1000)}k`)));
  row("median time", cols.map((k) => (Number.isNaN(k.durationMedianSec) ? "—" : `${Math.round(k.durationMedianSec)}s`)));
  row("churn (lines)", cols.map((k) => (Number.isNaN(k.churnMean) ? "—" : String(Math.round(k.churnMean)))));
  if (cols.some((k) => k.usedRate != null)) row("skill used", cols.map((k) => (k.usedRate === 0 ? yellow("0%") : pct(k.usedRate))));
  const excluded = cols.reduce((a, k) => a + k.excluded, 0);
  if (excluded) out.push(dim(`${excluded} trial(s) excluded as infra errors`));
  out.push("");

  for (const k of cols) if (k !== base) out.push(`${pad(bold(k.skill), colW + 2)}${verdict(k, base)}`);
  out.push("");
  process.stdout.write(out.join("\n") + "\n");
}
