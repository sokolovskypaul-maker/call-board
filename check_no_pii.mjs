#!/usr/bin/env node
// Refuse to publish if any file under a folder looks like it holds lead data.
// Node twin of check_no_pii.py, for when python3 is unavailable.
// Usage: node check_no_pii.mjs [folder]   (default: this folder). Exit code 1 lists the offending lines.
import {readdirSync, readFileSync, statSync} from "node:fs";
import {join, relative, extname, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = process.argv[2] || dirname(fileURLToPath(import.meta.url));
const PATTERNS = [
  ["Israeli phone number", /(?<![\d.])(?:\+?972[-\s]?|0)(?:5\d|7\d|[2-489])[-\s]?\d{3}[-\s]?\d{4}(?!\d)/g],
  ["Google place id", /\bChIJ[\w-]{10,}/g],
  ["Facebook post link", /facebook\.com\/(?:groups\/\d+\/permalink|reel)\//g],
];
const ALLOWED = new Set(["050-000-0000", "050-0000000"]);  // placeholders used in sample-data.json
const EXT = new Set([".py", ".html", ".md", ".json", ".txt", ".js", ".mjs", ".css", ".sql"]);

const hits = [];
function walk(dir){
  for (const name of readdirSync(dir)){
    if (name === ".git" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()){ walk(p); continue; }
    if (!EXT.has(extname(p))) continue;
    readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(PATTERNS|\["(Israeli|Google|Facebook)|"(Israeli|Google|Facebook))/.test(line)) return;
      for (const [label, rx] of PATTERNS) for (const m of line.matchAll(rx))
        if (!ALLOWED.has(m[0])) hits.push(`${relative(ROOT, p)}:${i + 1}: ${label}: ${m[0]}`);
    });
  }
}
walk(ROOT);
if (hits.length){ console.log("Possible lead data found, do not publish:\n" + hits.join("\n")); process.exit(1); }
console.log("OK: no phone numbers, place ids or post links found.");
