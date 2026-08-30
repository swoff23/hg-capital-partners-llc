/** Accumulates a human-readable migration report written to ./migration-report.md */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./_lib";

type Section = { title: string; lines: string[] };

class Report {
  private sections: Section[] = [];
  private current: Section | null = null;

  section(title: string) {
    this.current = { title, lines: [] };
    this.sections.push(this.current);
    console.log(`\n=== ${title} ===`);
  }

  line(msg: string) {
    (this.current?.lines ?? []).push(msg);
    console.log(msg);
  }

  warn(msg: string) {
    this.line(`⚠️  ${msg}`);
  }

  write() {
    const out = [
      "# HG Master Database → HG Capital OS — Migration Report",
      "",
      `Generated ${new Date().toISOString()}`,
      "",
      ...this.sections.flatMap((s) => [`## ${s.title}`, "", ...s.lines.map((l) => `- ${l}`), ""]),
    ].join("\n");
    fs.writeFileSync(path.join(REPO_ROOT, "migration-report.md"), out);
    console.log(`\nWrote migration-report.md`);
  }
}

export const report = new Report();
