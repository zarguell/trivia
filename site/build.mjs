#!/usr/bin/env node
/**
 * Six Things — custom static site generator.
 *
 * Structured data in, complete static HTML out. No framework, no runtime deps.
 *   data/generated/site.json   curated topics + facts + clue pool
 *   data/generated/daily/*     deterministic daily puzzles
 *   data/generated/endless/*   per-deck clue pools
 *
 * Usage: node site/build.mjs [--base=/trivia/] [--out=dist]
 */
import { readFile, writeFile, mkdir, rm, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, layout, icon } from "./lib/html.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.join("=") || true];
}));
const BASE = String(args.base || process.env.BASE_PATH || "/trivia/").replace(/\/?$/, "/");
const OUT = path.resolve(ROOT, String(args.out || "dist"));
const GEN = path.join(ROOT, "data", "generated");

const readJSON = async (p) => JSON.parse(await readFile(p, "utf8"));
const site = await readJSON(path.join(GEN, "site.json"));
const dailyIndex = await readJSON(path.join(GEN, "daily", "index.json"));
const dailyYears = {};
for (const y of dailyIndex.years) dailyYears[y] = await readJSON(path.join(GEN, "daily", `${y}.json`));
const allPuzzles = Object.values(dailyYears).flat().sort((a, b) => a.d.localeCompare(b.d));

const topicById = new Map(site.topics.map((t) => [t.id, t]));
const deckById = new Map(site.decks.map((d) => [d.id, d]));
const deckTitle = (id) => deckById.get(id)?.title || id;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric",
});
const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const today = iso(new Date());
const todayPuzzle = allPuzzles.find((p) => p.d === today)
  || allPuzzles.reduce((best, p) => Math.abs(p.d.localeCompare(today)) < Math.abs(best.d.localeCompare(today)) ? p : best, allPuzzles[0]);
const todayTopic = topicById.get(todayPuzzle.t);
const todayDeck = todayPuzzle.td || deckTitle(todayTopic?.deck || "");
const lookupCount = site.stats.lookupClues || 0;

// ------------------------------------------------------------------ output
await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, "assets"), { recursive: true });

async function writePage(rel, html) {
  const dst = path.join(OUT, rel);
  await mkdir(path.dirname(dst), { recursive: true });
  await writeFile(dst, html);
}

async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await cp(s, d);
  }
}

// ------------------------------------------------------------------ fragments
const base = BASE;

function screenHead({ title, meta = "", sub = "" }) {
  return `<header class="screen-head">
    <div class="screen-title-row">
      <h1 class="screen-name">${esc(title)}</h1>
      ${meta ? `<span class="screen-meta">${meta}</span>` : ""}
    </div>
    ${sub ? `<p class="screen-sub">${sub}</p>` : ""}
  </header>`;
}

function categoryRow(d) {
  return `<a class="category-row" href="${base}study/${d.id}/">
    <span class="category-row__name">${esc(d.title)}</span>
    <span class="category-row__count">${d.topicCount}</span>
    <span class="category-row__blurb">${esc(d.blurb)}</span>
    ${icon("chevron", "ico category-row__chev")}
  </a>`;
}

function topicRow(t) {
  return `<a class="topic-row" href="${base}topic/${t.id}/" data-topic="${t.id}" data-facts="${t.factCount}">
    <span class="topic-row__main">
      <strong>${esc(t.name)}</strong>
      <span class="topic-row__hook">${esc(t.hook)}</span>
    </span>
    <span class="topic-row__side">
      <span class="mastery" data-mastery hidden>
        <span class="mastery__bar"><i></i></span>
        <span class="mastery__label"></span>
      </span>
    </span>
    ${icon("chevron", "ico topic-row__chev")}
  </a>`;
}

function relatedRow(t) {
  return `<a class="related-row" href="${base}topic/${t.id}/">
    <span>${esc(t.name)}</span>
    <span class="related-row__deck">${esc(deckTitle(t.deck))}</span>
    ${icon("chevron", "ico related-row__chev")}
  </a>`;
}

function dailyContent() {
  return `
  <section class="today-head">
    <div class="today-title-row">
      <span class="today-label">Today</span>
      <span class="today-date" data-daily-date>${esc(shortDate(todayPuzzle.d))}</span>
    </div>
    <div class="today-topic-row">
      <div>
        <p class="today-deck" data-daily-deck>${esc(todayDeck)}</p>
        <h1 class="today-topic"><a href="${base}topic/${todayPuzzle.t}/" data-daily-topic-link><span data-daily-topic>${esc(todayPuzzle.tn)}</span></a></h1>
      </div>
      <div class="today-status">
        <span data-daily-step>Question 1 of 7</span>
        <span class="streak" data-streak hidden></span>
      </div>
    </div>
    <div class="progress" role="progressbar" aria-label="Challenge progress" aria-valuemin="0" aria-valuemax="7" aria-valuenow="0" data-daily-progressbar>
      <i data-daily-progress style="width:0%"></i>
    </div>
  </section>
  <div id="daily-app" class="game-shell" aria-live="polite">
    <noscript><p class="notice">The daily challenge needs JavaScript.</p></noscript>
    <div class="skeleton"><span></span><span></span><span></span></div>
  </div>
  <div class="game-foot">
    <a class="link-quiet" href="${base}daily/archive/">Past challenges</a>
  </div>`;
}

function dailyPage({ title, description }) {
  return layout({
    base,
    page: "daily",
    active: "today",
    title,
    description,
    narrow: true,
    preload: `<link rel="preload" href="${base}data/daily/${today.slice(0, 4)}.json" as="fetch" crossorigin>`,
    content: dailyContent(),
  });
}

// ------------------------------------------------------------------ today (home + daily)
const todayPage = dailyPage({
  title: "Today",
  description: "Today's topic, seven questions, typed answers. The same challenge for everyone.",
});

// daily archive
const recent = allPuzzles.filter((p) => p.d <= today).slice(-120).reverse();
const dailyArchivePage = layout({
  base,
  page: "daily-archive",
  active: "today",
  title: "Daily archive",
  description: "Past daily challenges, one topic at a time.",
  narrow: true,
  content: `
  ${screenHead({ title: "Daily archive", meta: `${recent.length} recent puzzles` })}
  <ul class="day-list">
    ${recent.map((p) => `<li>
      <a href="${base}daily/?d=${p.d}">
        <span class="day-list__date">${esc(shortDate(p.d))}</span>
        <span class="day-list__topic">${esc(p.tn)}</span>
        <span class="day-list__deck">${esc(p.td || deckTitle(topicById.get(p.t)?.deck || ""))}</span>
        ${icon("chevron")}
      </a></li>`).join("")}
  </ul>`,
});

// ------------------------------------------------------------------ study
const studyPage = layout({
  base,
  page: "study",
  active: "study",
  title: "Study",
  description: "Browse topics distilled from the Jeopardy archive, then test them against real clues.",
  narrow: true,
  content: `
  ${screenHead({ title: "Study", meta: `${fmt(site.decks.length)} categories · ${fmt(site.topics.length)} topics` })}
  <nav class="category-list" aria-label="Study categories">
    ${site.decks.map(categoryRow).join("")}
  </nav>`,
});

for (const d of site.decks) {
  const topics = d.topics.map((id) => topicById.get(id)).filter(Boolean);
  const html = layout({
    base,
    page: "deck",
    active: "study",
    title: d.title,
    description: `${topics.length} ${d.title} topics distilled from the Jeopardy archive.`,
    narrow: true,
    content: `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${base}study/">Study</a>${icon("chevron")}<span>${esc(d.title)}</span></nav>
    ${screenHead({ title: d.title, meta: `${topics.length} topics`, sub: esc(d.blurb) })}
    <div class="topic-list">
      ${topics.map(topicRow).join("")}
    </div>`,
  });
  await writePage(`study/${d.id}/index.html`, html);
}

// ------------------------------------------------------------------ topic pages
for (const t of site.topics) {
  const related = (t.related || []).map((id) => topicById.get(id)).filter(Boolean);
  const payload = { id: t.id, name: t.name, deck: t.deck, clues: t.clues, facts: t.facts };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = layout({
    base,
    page: "topic",
    active: "study",
    title: t.name,
    description: `${t.name}: ${t.factCount} things Jeopardy keeps asking, with ${t.clueCount} real clues.`,
    narrow: true,
    content: `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="${base}study/">Study</a>${icon("chevron")}
      <a href="${base}study/${t.deck}/">${esc(deckTitle(t.deck))}</a>${icon("chevron")}<span>${esc(t.name)}</span>
    </nav>
    <header class="topic-head">
      <div class="topic-title-row">
        <h1>${esc(t.name)}</h1>
        <span class="topic-years">${t.first ? t.first.slice(0, 4) : "1984"}–${t.last ? t.last.slice(0, 4) : "2026"}</span>
      </div>
      <p class="topic-hook">${esc(t.hook)}</p>
      <div class="topic-actions">
        <button class="btn btn--primary" type="button" data-action="start-topic-quiz">Quiz me ${icon("arrow")}</button>
        <button class="btn btn--ghost" type="button" data-action="toggle-facts">Show clues</button>
        <span class="mastery mastery--inline" data-mastery hidden><span class="mastery__bar"><i></i></span><span class="mastery__label"></span></span>
      </div>
    </header>

    <section class="quiz-section" id="topic-quiz" hidden>
      <div class="section-head"><h2>Quiz</h2><button class="link-quiet" type="button" data-action="close-quiz">Close</button></div>
      <div class="quiz" data-quiz></div>
    </section>

    <section class="facts" aria-label="The things worth knowing">
      ${t.facts.map((f, i) => `<article class="fact" id="fact-${esc(f.id)}" data-fact="${esc(f.id)}">
        <div class="fact__num">${pad(i + 1)}</div>
        <div class="fact__body">
          <p class="fact__label">${esc(f.label)}</p>
          <p class="fact__statement">${esc(f.statement)}</p>
          <div class="chips">${f.associations.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</div>
          ${f.clues?.length ? `<details class="clue-drawer">
            <summary>${f.clues.length} real clue${f.clues.length > 1 ? "s" : ""} ${icon("chevron")}</summary>
            <ul>${f.clues.map((c) => `<li><p class="clue-mini">${esc(c.c)}</p><p class="clue-mini__a"><b>${esc(c.a)}</b> · ${esc(c.k)} · ${esc(c.d.slice(0, 4))}</p></li>`).join("")}</ul>
          </details>` : ""}
          <button class="know" type="button" data-action="know-fact" data-fact-id="${esc(f.id)}" aria-pressed="false">${icon("check")}<span>I knew this</span></button>
        </div>
      </article>`).join("")}
    </section>

    ${related.length ? `<section class="related">
      <h2>Related</h2>
      <div class="related-list">${related.map(relatedRow).join("")}</div>
    </section>` : ""}
    <script type="application/json" id="topic-data">${json}</script>`,
  });
  await writePage(`topic/${t.id}/index.html`, html);
}

// ------------------------------------------------------------------ endless
const endlessPage = layout({
  base,
  page: "endless",
  active: "endless",
  title: "Endless",
  description: "Rapid-fire trivia from a curated pool of real Jeopardy clues. Build a streak.",
  narrow: true,
  content: `
  <header class="endless-head">
    <h1 class="screen-name">Endless</h1>
    <div class="endless-pick">
      <label class="sr-only" for="deck-select">Category</label>
      <select id="deck-select" class="select">
        <option value="potpourri">Mixed</option>
        ${site.decks.filter((d) => d.id !== "potpourri").map((d) => `<option value="${d.id}">${esc(d.title)}</option>`).join("")}
      </select>
    </div>
  </header>
  <div id="endless-app" class="quiz" aria-live="polite">
    <div class="skeleton"><span></span><span></span><span></span></div>
  </div>
  <div class="record-line" data-endless-record hidden>
    <span>Best <b data-best>0</b></span>
    <span>Correct <b data-total>0</b></span>
  </div>`,
});

// ------------------------------------------------------------------ archive
const archiveSearch = layout({
  base,
  page: "archive",
  active: "archive",
  title: "Lookup",
  description: "Search text-only clues from the Jeopardy archive by answer, with air dates.",
  narrow: true,
  content: `
  ${screenHead({ title: "Lookup", meta: `${fmt(lookupCount)} text clues` })}
  <div class="lookup">
    <label class="sr-only" for="q">Search clues by answer</label>
    <div class="lookup__box">
      ${icon("archive")}
      <input id="q" type="search" placeholder="Search by answer…" autocomplete="off" spellcheck="false">
      <button class="btn btn--ghost btn--sm" type="button" data-action="random-clue">Random</button>
    </div>
    <div class="lookup__controls">
      <label class="switch"><input type="checkbox" data-action="hide-answers" checked> <span>Hide answers</span></label>
      <span class="lookup__count" data-count></span>
    </div>
  </div>
  <div id="results" class="results" aria-live="polite">
    <div class="empty">
      <p>Try <button class="inline-link" data-query="pistachio">pistachio</button>, <button class="inline-link" data-query="Gone with the Wind">Gone with the Wind</button>, or <button class="inline-link" data-query="Buchanan">Buchanan</button>.</p>
    </div>
  </div>`,
});

// ------------------------------------------------------------------ about
const aboutPage = layout({
  base,
  page: "about",
  active: "about",
  title: "About",
  description: "The thesis behind Six Things: study Jeopardy by Jeopardy, learn the things each topic actually tests.",
  content: `
  <article class="prose">
    <h1>About</h1>
    <p class="lede">Six Things is a study tool built on one observation: trivia is a small set of associations, not an encyclopedia.</p>

    <p>I got the idea from a video about studying for <i>Jeopardy!</i> — and from a bar trivia night. The question was: <em>which nut, besides the almond, appears in the Bible?</em> The answer is pistachio. The archive has asked about pistachios decade after decade.</p>

    <p>That is not a coincidence. <i>Jeopardy!</i> has asked about <i>Gone with the Wind</i> 231 times. Almost every clue reduces to the same few facts: Margaret Mitchell wrote it, it won the Pulitzer, the film came out in 1939, Scarlett O'Hara and Rhett Butler, Tara, Hattie McDaniel, "tomorrow is another day." Learn those seven and you can answer nearly any clue they throw at the book.</p>

    <p>So this site does the dissection for you. It mines every clue in the archive — ${fmt(site.stats.cluesMined)} of them, 1984 through 2026 — groups them by topic, and surfaces the repeated associations. A curator turns that evidence into ${fmt(site.stats.facts)} facts across ${fmt(site.stats.topics)} topics; every fact is tied to real clues you can inspect.</p>

    <h2>How it works</h2>
    <ol class="steps">
      <li><b>Normalize.</b> Clues, responses, categories, air dates and rounds are cleaned and deduplicated.</li>
      <li><b>Find the topic.</b> Frequent answers and repeated named entities become topic candidates.</li>
      <li><b>Measure the association.</b> For each topic: what it is the answer to, which answers cluster around it, and which words recur in its clues.</li>
      <li><b>Distill.</b> Curators write the handful of things worth knowing, citing the exact clue ids that demonstrate each one.</li>
      <li><b>Generate.</b> A custom static-site generator turns the structured packs into HTML and JSON. No framework, no database, no server.</li>
    </ol>

    <h2>The game</h2>
    <ul>
      <li><b>Today.</b> Seven questions on one topic, the same for everyone, deterministic by date. Type your answer; close spelling and surnames count. Your score is a shareable grid.</li>
      <li><b>Study.</b> ${fmt(site.stats.topics)} topics, each a handful of facts and the real clues behind them. Mark what you knew; mastery stays on your device.</li>
      <li><b>Endless.</b> Rapid-fire real clues. A wrong answer resets the streak, not the session.</li>
      <li><b>Lookup.</b> Search the ${fmt(lookupCount)} text-only clues by answer and see when each one aired.</li>
    </ul>

    <h2>Data &amp; credit</h2>
    <p>The corpus is a cleaned, text-only <a href="https://github.com/jwolle1/jeopardy_clue_dataset" rel="noopener">Jeopardy! clue dataset</a> covering seasons 1–42, derived from the fan-run <a href="https://j-archive.com/" rel="noopener">J! Archive</a>. Of ${fmt(site.stats.cluesMined)} mined clues, ${fmt(lookupCount)} text-only, self-contained clues are available in Lookup. The original idea comes from C W's video <a href="https://youtu.be/wZq-eRimBE8" rel="noopener">“How to Study for Jeopardy”</a>. Built with a deliberately boring custom SSG and deployed by GitHub Actions to GitHub Pages.</p>
    <p class="fine">All clues and responses remain the property of Jeopardy Productions, Inc. This is an unaffiliated, non-commercial fan project for personal study. No images or media-dependent clues are used. If you own the rights and want something removed, open an issue on <a href="https://github.com/zarguell/trivia" rel="noopener">GitHub</a>.</p>
  </article>`,
});

// ------------------------------------------------------------------ 404 + feeds
const notFound = layout({
  base, page: "404", title: "Page not found", narrow: true,
  description: "That page is not in the archive.",
  content: `<section class="screen-head"><h1 class="screen-name">Page not found</h1><p class="screen-sub">That page is not on the board.</p><p class="notfound-actions"><a class="btn btn--primary" href="${base}">Go to Today</a></p></section>`,
});

// ------------------------------------------------------------------ write assets
await copyDir(path.join(HERE, "client"), path.join(OUT, "assets"));
await writeFile(path.join(OUT, "assets", "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0e1730"/><text x="32" y="45" font-family="Georgia,serif" font-size="38" font-weight="700" fill="#f4c95d" text-anchor="middle">6</text></svg>`);

// data payloads
const trimmed = {
  stats: site.stats,
  decks: site.decks.map((d) => ({ ...d, topics: d.topics.map((id) => {
    const t = topicById.get(id);
    return { id, name: t.name, hook: t.hook, factCount: t.factCount, clueCount: t.clueCount, deck: t.deck };
  }) })),
  topics: site.topics.map((t) => ({
    id: t.id, name: t.name, deck: t.deck, hook: t.hook,
    factCount: t.factCount, clueCount: t.clueCount,
  })),
};
await mkdir(path.join(OUT, "data"), { recursive: true });
await writeFile(path.join(OUT, "data", "site.json"), JSON.stringify(trimmed));
await copyDir(path.join(GEN, "daily"), path.join(OUT, "data", "daily"));
await copyDir(path.join(GEN, "endless"), path.join(OUT, "data", "endless"));
await copyDir(path.join(GEN, "lookup"), path.join(OUT, "data", "lookup"));

// manifest + robots + sitemap
await writeFile(path.join(OUT, "manifest.webmanifest"), JSON.stringify({
  name: "Six Things", short_name: "Six Things", start_url: BASE, scope: BASE,
  display: "standalone", background_color: "#0a1020", theme_color: "#0a1020",
  icons: [{ src: `${BASE}assets/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" }],
}));
await writeFile(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: https://zarguell.github.io${BASE}sitemap.xml\n`);
const urls = ["", "daily/", "daily/archive/", "study/", "endless/", "archive/", "about/",
  ...site.decks.map((d) => `study/${d.id}/`),
  ...site.topics.map((t) => `topic/${t.id}/`)];
await writeFile(path.join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>https://zarguell.github.io${BASE}${u}</loc></url>`).join("\n")}\n</urlset>\n`);

// ------------------------------------------------------------------ pages
await writePage("index.html", todayPage);
await writePage("daily/index.html", todayPage);
await writePage("daily/archive/index.html", dailyArchivePage);
await writePage("study/index.html", studyPage);
await writePage("endless/index.html", endlessPage);
await writePage("archive/index.html", archiveSearch);
await writePage("about/index.html", aboutPage);
await writePage("404.html", notFound);

console.log(`built ${urls.length} pages → ${path.relative(ROOT, OUT)}`);
console.log(`topics: ${site.topics.length}, facts: ${site.stats.facts}, clues: ${site.stats.cluesMined}, lookup: ${lookupCount}`);
console.log(`base: ${BASE}`);
