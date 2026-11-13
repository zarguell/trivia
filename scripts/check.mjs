#!/usr/bin/env node
/** Post-build integrity check: every local link resolves, every data file parses. */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const BASE = process.env.BASE_PATH || "/trivia/";

const walk = async (dir) => {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
};
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

const files = await walk(DIST);
const html = files.filter((f) => f.endsWith(".html"));
const problems = [];
const seen = new Set();

for (const file of html) {
  const src = await readFile(file, "utf8");
  for (const m of src.matchAll(/(?:href|src)="([^"]+)"/g)) {
    let url = m[1];
    if (url.startsWith("#") || /^(https?:|mailto:|data:|javascript:)/.test(url)) continue;
    if (!url.startsWith(BASE)) { problems.push(`${path.relative(DIST, file)}: link escapes base: ${url}`); continue; }
    url = url.slice(BASE.length).split("#")[0].split("?")[0];
    let target = path.join(DIST, url);
    if (url === "" || url.endsWith("/")) target = path.join(target, "index.html");
    seen.add(target);
    if (!(await exists(target))) problems.push(`${path.relative(DIST, file)}: missing ${url}`);
  }
  if (/\$\{[^}]+\}/.test(src)) problems.push(`${path.relative(DIST, file)}: unresolved template expression`);
}

// Every JSON payload the client fetches must parse.
const required = [
  "data/site.json", "data/daily/index.json", "data/lookup/index.json",
  "data/daily/2026.json", "data/endless/history.json",
];
for (const rel of required) {
  const p = path.join(DIST, rel);
  if (!(await exists(p))) { problems.push(`missing ${rel}`); continue; }
  try { JSON.parse(await readFile(p, "utf8")); }
  catch { problems.push(`invalid JSON: ${rel}`); }
}

const site = JSON.parse(await readFile(path.join(DIST, "data/site.json"), "utf8"));
for (const t of site.topics) {
  if (!(await exists(path.join(DIST, "topic", t.id, "index.html")))) problems.push(`no page for topic ${t.id}`);
}
for (const f of files) {
  if (f.endsWith(".html") && (await stat(f)).size < 1500) problems.push(`suspiciously small page: ${path.relative(DIST, f)}`);
}

console.log(`checked ${html.length} pages, ${files.length} files, ${site.topics.length} topics`);
if (problems.length) {
  console.error(problems.slice(0, 30).join("\n"));
  console.error(`${problems.length} problems`);
  process.exit(1);
}
console.log("all local links and payloads OK");
