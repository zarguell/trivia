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
import { existsSync } from "node:fs";
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
const prettyDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric",
});
const shortDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric",
});
const fmt = (n) => n.toLocaleString("en-US");
const today = iso(new Date());
const todayPuzzle = allPuzzles.find((p) => p.d === today)
  || allPuzzles.reduce((best, p) => Math.abs(p.d.localeCompare(today)) < Math.abs(best.d.localeCompare(today)) ? p : best, allPuzzles[0]);

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
function btn(href, label, kind = "primary", extra = "") {
  return `<a class="btn btn--${kind}" href="${base}${href}" ${extra}>${label}${kind === "primary" ? icon("arrow") : ""}</a>`;
}
const base = BASE;

function tag(text, kind = "") {
  return `<span class="tag${kind ? ` tag--${kind}` : ""}">${esc(text)}</span>`;
}

function topicCard(t) {
  return `<a class="topic-card" href="${base}topic/${t.id}/">
    <span class="topic-card__deck">${esc(deckTitle(t.deck))}</span>
    <strong>${esc(t.name)}</strong>
    <span class="topic-card__hook">${esc(t.hook)}</span>
    <span class="topic-card__meta">${t.factCount} things · ${t.clueCount} clues</span>
  </a>`;
}

function deckCard(d, i) {
  const samples = d.topics.slice(0, 3).map((id) => topicById.get(id)?.name).filter(Boolean);
  return `<a class="deck-card" href="${base}study/${d.id}/" style="--i:${i}">
    <span class="deck-card__bar"></span>
    <span class="deck-card__count">${d.topicCount}</span>
    <h3>${esc(d.title)}</h3>
    <p>${esc(d.blurb)}</p>
    <span class="deck-card__samples">${esc(samples.join(" · "))}</span>
    <span class="deck-card__cta">Study ${d.topicCount} topics ${icon("chevron")}</span>
  </a>`;
}

function dailyCard(p, { compact = false } = {}) {
  if (!p) return "";
  const t = topicById.get(p.t);
  return `<section class="daily-card" id="home-daily" data-date="${p.d}">
    <div class="daily-card__head">
      ${tag("Today's challenge", "accent")}
      <span class="daily-card__date" data-daily-date>${esc(prettyDate(p.d))}</span>
    </div>
    <div class="daily-card__body">
      <div>
        <p class="kicker">${esc(deckTitle(t?.deck || ""))}</p>
        <h2 data-daily-topic>${esc(p.tn)}</h2>
        <p class="daily-card__hook" data-daily-hook>${esc(p.th)}</p>
      </div>
      <div class="daily-card__meta">
        <span><b>6</b> clues</span>
        <span><b>1</b> final</span>
        <span><b>2,000</b> max</span>
      </div>
    </div>
    <div class="daily-card__actions">
      <a class="btn btn--primary" href="${base}daily/?d=${p.d}" data-daily-link>Play today's challenge ${icon("arrow")}</a>
      <span class="streak" data-streak hidden></span>
      ${compact ? "" : `<a class="link-quiet" href="${base}daily/archive/">Past challenges</a>`}
    </div>
  </section>`;
}

// ------------------------------------------------------------------ home
const featured = [...site.topics].sort((a, b) => b.clueCount - a.clueCount).slice(0, 8);
const home = layout({
  base,
  page: "home",
  active: "today",
  title: "Six Things",
  description: "Daily trivia and spaced study built from 544,106 Jeopardy! clues. Learn the handful of things the show actually asks about every topic.",
  content: `
  <section class="hero">
    <p class="eyebrow"><span class="dot"></span>${fmt(site.stats.cluesMined)} clues, mined and distilled</p>
    <h1 class="display">Six things.<br><em>That's the whole trick.</em></h1>
    <p class="lede">Jeopardy has asked about <i>Gone with the Wind</i> 231 times. Nearly every clue is one of seven facts. Learn those, not Wikipedia. Then do it for every topic the show loves.</p>
    <div class="cta-row">
      ${btn(`daily/?d=${todayPuzzle.d}`, "Play today's challenge")}
      ${btn("study/", "Study mode", "ghost")}
    </div>
    <div class="hero-stats">
      <div><b>${fmt(site.stats.cluesMined)}</b><span>clues read</span></div>
      <div><b>${fmt(site.stats.topics)}</b><span>topics distilled</span></div>
      <div><b>${fmt(site.stats.facts)}</b><span>things worth knowing</span></div>
      <div><b>${site.stats.firstDate.slice(0, 4)}–${site.stats.lastDate.slice(0, 4)}</b><span>years covered</span></div>
    </div>
  </section>

  ${dailyCard(todayPuzzle)}

  <section class="section">
    <div class="section-head">
      <div><p class="kicker">Study mode</p><h2>Learn the seams of the archive</h2></div>
      <a class="link-quiet" href="${base}study/">All ${site.topics.length} topics ${icon("chevron")}</a>
    </div>
    <p class="section-sub">Each topic is a six-minute lesson: the handful of associations that unlock most clues, each backed by real questions from 1984 to today.</p>
    <div class="deck-grid">
      ${site.decks.slice(0, 8).map(deckCard).join("")}
    </div>
  </section>

  <section class="section two-col">
    <div class="panel panel--accent">
      <p class="kicker">Endless mode</p>
      <h2>Play until you miss</h2>
      <p>Rapid-fire questions drawn from a curated pool of real clues, balanced across easy and brutal. Build a streak, then find the topics that broke it.</p>
      ${btn("endless/", "Start endless")}
    </div>
    <div class="panel">
      <p class="kicker">Lookup</p>
      <h2>Did Jeopardy ask this?</h2>
      <p>Type anything — a word, a person, a guess from bar trivia — and see every curated clue tied to it, with the date it aired.</p>
      ${btn("archive/", "Search the archive", "ghost")}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div><p class="kicker">Most asked</p><h2>Start with the heavy hitters</h2></div>
    </div>
    <div class="topic-grid">
      ${featured.map(topicCard).join("")}
    </div>
  </section>`,
});

// ------------------------------------------------------------------ daily
const dailyPage = layout({
  base,
  page: "daily",
  active: "today",
  title: "Daily challenge",
  description: "Six clues on one topic plus a final. Same puzzle for everyone, every day.",
  preload: `<link rel="preload" href="${base}data/daily/${today.slice(0, 4)}.json" as="fetch" crossorigin>`,
  content: `
  <section class="game-head">
    <p class="kicker">Daily challenge</p>
    <h1 class="h1">One topic. Seven questions.</h1>
    <p class="section-sub" id="daily-sub">Same puzzle for everyone. Type your answer; spelling is forgiven.</p>
  </section>
  <div id="daily-app" class="game-shell" aria-live="polite">
    <noscript><p class="notice">The daily challenge needs JavaScript.</p></noscript>
    <div class="skeleton"><span></span><span></span><span></span></div>
  </div>
  <div class="game-foot">
    <a class="link-quiet" href="${base}daily/archive/">Past challenges ${icon("chevron")}</a>
    <a class="link-quiet" href="${base}study/">Study instead</a>
  </div>`,
});

// daily archive
const recent = allPuzzles.filter((p) => p.d <= today).slice(-120).reverse();
const archivePage = layout({
  base,
  page: "daily-archive",
  active: "today",
  title: "Past daily challenges",
  description: "Every daily challenge, one topic at a time.",
  content: `
  <section class="page-head">
    <p class="kicker">Daily archive</p>
    <h1 class="h1">Past challenges</h1>
    <p class="section-sub">Puzzles are deterministic: the same date always produces the same seven questions.</p>
  </section>
  <ul class="day-list">
    ${recent.map((p) => `<li>
      <a href="${base}daily/?d=${p.d}">
        <span class="day-list__date">${esc(shortDate(p.d))}</span>
        <span class="day-list__topic">${esc(p.tn)}</span>
        <span class="day-list__deck">${esc(deckTitle(topicById.get(p.t)?.deck || ""))}</span>
        ${icon("chevron")}
      </a></li>`).join("")}
  </ul>`,
});

// ------------------------------------------------------------------ study
const studyPage = layout({
  base,
  page: "study",
  active: "study",
  title: "Study mode",
  description: "Browse topics distilled from the Jeopardy archive. Learn the six things, then test them against real clues.",
  content: `
  <section class="page-head">
    <p class="kicker">Study mode</p>
    <h1 class="h1">Pick a seam.<br>Learn it in six minutes.</h1>
    <p class="section-sub">Every topic has a handful of facts that keep coming back. Read the facts, flip the cards, then prove it on real clues. Mastery is tracked on this device.</p>
  </section>
  <div class="deck-grid deck-grid--wide">
    ${site.decks.map(deckCard).join("")}
  </div>
  <section class="section">
    <div class="section-head"><div><p class="kicker">Everything</p><h2>All ${site.topics.length} topics</h2></div></div>
    <div class="topic-grid">${site.topics.map(topicCard).join("")}</div>
  </section>`,
});

for (const d of site.decks) {
  const topics = d.topics.map((id) => topicById.get(id)).filter(Boolean);
  const html = layout({
    base,
    page: "deck",
    active: "study",
    title: d.title,
    description: `${topics.length} ${d.title} topics distilled from the Jeopardy archive.`,
    content: `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${base}study/">Study</a>${icon("chevron")}<span>${esc(d.title)}</span></nav>
    <section class="page-head">
      <p class="kicker">${esc(d.title)}</p>
      <h1 class="h1">${topics.length} topics. ${topics.reduce((n, t) => n + t.factCount, 0)} things.</h1>
      <p class="section-sub">${esc(d.blurb)}. Read a topic, then let the archive quiz you on it.</p>
    </section>
    <div class="topic-grid">
      ${topics.map((t) => `<a class="topic-card" href="${base}topic/${t.id}/" data-topic="${t.id}" data-facts="${t.factCount}">
        <span class="topic-card__deck">${esc(t.name === t.name ? `${t.factCount} things` : "")}</span>
        <strong>${esc(t.name)}</strong>
        <span class="topic-card__hook">${esc(t.hook)}</span>
        <span class="topic-card__meta">${t.clueCount} clues${t.last ? ` · through ${esc(t.last.slice(0, 4))}` : ""}</span>
        <span class="mastery" data-mastery hidden><span class="mastery__bar"><i></i></span><span class="mastery__label"></span></span>
      </a>`).join("")}
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
    content: `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="${base}study/">Study</a>${icon("chevron")}
      <a href="${base}study/${t.deck}/">${esc(deckTitle(t.deck))}</a>${icon("chevron")}<span>${esc(t.name)}</span>
    </nav>
    <header class="topic-hero">
      <p class="kicker">${esc(deckTitle(t.deck))}</p>
      <h1>${esc(t.name)}</h1>
      <p class="lede">${esc(t.hook)}</p>
      <div class="topic-hero__meta">
        <span><b>${t.factCount}</b> things</span>
        <span><b>${t.clueCount}</b> real clues</span>
        <span><b>${t.first ? t.first.slice(0, 4) : "1984"}–${t.last ? t.last.slice(0, 4) : "2026"}</b> on the show</span>
      </div>
      <div class="cta-row">
        <button class="btn btn--primary" type="button" data-action="start-topic-quiz">Test yourself ${icon("arrow")}</button>
        <button class="btn btn--ghost" type="button" data-action="toggle-facts">Show all clues</button>
      </div>
      <div class="mastery mastery--hero" data-mastery hidden><span class="mastery__bar"><i></i></span><span class="mastery__label"></span></div>
    </header>

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

    <section class="section quiz-section" id="topic-quiz" hidden>
      <div class="section-head"><div><p class="kicker">Prove it</p><h2>Real clues, no multiple choice</h2></div><button class="link-quiet" type="button" data-action="close-quiz">Close</button></div>
      <div class="quiz" data-quiz></div>
    </section>

    ${related.length ? `<section class="section">
      <div class="section-head"><div><p class="kicker">Keep going</p><h2>Related seams</h2></div></div>
      <div class="topic-grid">${related.map(topicCard).join("")}</div>
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
  title: "Endless mode",
  description: "Rapid-fire trivia from a curated pool of real Jeopardy clues. Build a streak.",
  preload: `<link rel="preload" href="${base}data/site.json" as="fetch" crossorigin>`,
  content: `
  <section class="page-head page-head--split">
    <div>
      <p class="kicker">Endless</p>
      <h1 class="h1">Play until you miss.<br>Then keep playing.</h1>
      <p class="section-sub">Four choices, real clues, no timer to start. Wrong answers reset the streak; the archive remembers what broke it.</p>
    </div>
    <div class="record" data-endless-record hidden>
      <span>Best streak</span><b data-best>0</b>
      <span>Lifetime correct</span><b data-total>0</b>
    </div>
  </section>
  <section class="endless-shell">
    <div class="deck-chips" role="group" aria-label="Choose a deck">
      <button class="chipbtn" type="button" data-deck="potpourri">Mixed</button>
      ${site.decks.filter((d) => d.id !== "potpourri").map((d) => `<button class="chipbtn" type="button" data-deck="${d.id}">${esc(d.title)}</button>`).join("")}
    </div>
    <div id="endless-app" class="quiz" aria-live="polite">
      <div class="skeleton"><span></span><span></span><span></span></div>
    </div>
  </section>`,
});

// ------------------------------------------------------------------ archive
const archiveSearch = layout({
  base,
  page: "archive",
  active: "archive",
  title: "Lookup",
  description: "Did Jeopardy ask this? Search over half a million real clues by answer or keyword.",
  content: `
  <section class="page-head">
    <p class="kicker">Lookup</p>
    <h1 class="h1">Did Jeopardy<br>ask this?</h1>
    <p class="section-sub">Search ${fmt(site.stats.cluesMined)} real clues by answer or phrase. Results come with the air date — the receipt for your word association. Lookup fetches one letter-sized shard, not the whole archive.</p>
  </section>
  <div class="lookup">
    <label class="sr-only" for="q">Search clues</label>
    <div class="lookup__box">
      ${icon("archive")}
      <input id="q" type="search" placeholder="pistachio, Buchanan, Uranus…" autocomplete="off" spellcheck="false">
      <button class="btn btn--ghost btn--sm" type="button" data-action="random-clue">Random</button>
    </div>
    <div class="lookup__meta"><span data-count>Fetches one shard, not the whole archive.</span>
      <label class="switch"><input type="checkbox" data-action="hide-answers" checked> <span>Hide answers until tapped</span></label>
    </div>
  </div>
  <div id="results" class="results" aria-live="polite">
    <div class="empty">
      <p class="empty__title">Type a word. Any word.</p>
      <p>Try <button class="inline-link" data-query="pistachio">pistachio</button>, <button class="inline-link" data-query="Gone with the Wind">Gone with the Wind</button>, or <button class="inline-link" data-query="Gothic">Gothic</button>.</p>
    </div>
  </div>`,
});

// ------------------------------------------------------------------ about
const aboutPage = layout({
  base,
  page: "about",
  active: "about",
  title: "Why this exists",
  description: "The thesis behind Six Things: study Jeopardy by Jeopardy, learn the six things each topic actually tests.",
  content: `
  <article class="prose">
    <p class="kicker">Why this exists</p>
    <h1>Trivia is not an encyclopedia.<br>It is a small set of associations.</h1>
    <p class="lede">You do not need to know everything about everything. You need to know the handful of things that keep getting asked.</p>

    <p>I got the idea from a video about studying for <i>Jeopardy!</i> — and from a bar trivia night. The question was: <em>which nut, besides the almond, appears in the Bible?</em> The answer is pistachio. The <i>Jeopardy!</i> archive had asked essentially the same thing in 1998.</p>

    <p>That is not a coincidence. <i>Jeopardy!</i> has asked about <i>Gone with the Wind</i> 231 times. Almost every clue reduces to the same few facts: Margaret Mitchell wrote it, it won the Pulitzer, the film came out in 1939, Scarlett O'Hara and Rhett Butler, Tara, Hattie McDaniel, "tomorrow is another day." Learn those seven and you can answer nearly any clue they throw at the book.</p>

    <p>So this site does the dissection for you. It mines every clue in the archive — ${fmt(site.stats.cluesMined)} of them, 1984 through 2026 — groups them by topic, and surfaces the repeated associations. A curator turns that evidence into ${fmt(site.stats.facts)} facts across ${fmt(site.stats.topics)} topics; every fact is tied to real clues you can inspect.</p>

    <h2>How the sausage is made</h2>
    <ol class="steps">
      <li><b>Normalize.</b> Clues, responses, categories, air dates and rounds are cleaned and deduplicated.</li>
      <li><b>Find the topic.</b> Frequent answers and repeated named entities become topic candidates.</li>
      <li><b>Measure the association.</b> For each topic: what it is the answer to, which answers cluster around it, and which words recur in its clues.</li>
      <li><b>Distill.</b> Curators write the handful of things worth knowing, citing the exact clue ids that demonstrate each one.</li>
      <li><b>Generate.</b> A custom static-site generator turns the structured packs into HTML and JSON. No framework, no database, no server.</li>
    </ol>

    <h2>The test</h2>
    <p>Open <a href="${base}topic/gone-with-the-wind/">Gone with the Wind</a>, read seven facts, then take the quiz. If the thesis is right, you will walk into the next trivia night with a new party trick.</p>

    <h2>Rules of the game</h2>
    <ul>
      <li><b>Daily challenge.</b> Seven questions on one topic, the same for everyone, deterministic by date. Type your answer; close spelling is accepted. Your score is a shareable grid.</li>
      <li><b>Study mode.</b> Facts, association chips, and the real clues behind them. Mark what you knew; mastery stays on your device.</li>
      <li><b>Endless.</b> Rapid-fire real clues. A wrong answer resets the streak, not the session.</li>
      <li><b>Lookup.</b> Type anything to see whether it has come up, and when.</li>
    </ul>

    <h2>Data &amp; credit</h2>
    <p>The corpus is a cleaned, text-only <a href="https://github.com/jwolle1/jeopardy_clue_dataset" rel="noopener">Jeopardy! clue dataset</a> covering seasons 1–42, derived from the fan-run <a href="https://j-archive.com/" rel="noopener">J! Archive</a>. The original idea comes from C W's video <a href="https://youtu.be/wZq-eRimBE8" rel="noopener">“How to Study for Jeopardy”</a>. Built with a deliberately boring custom SSG and deployed by GitHub Actions to GitHub Pages.</p>
    <p class="fine">All clues and responses remain the property of Jeopardy Productions, Inc. This is an unaffiliated, non-commercial fan project for personal study. No images or media-dependent clues are used. If you own the rights and want something removed, open an issue on <a href="https://github.com/zarguell/trivia" rel="noopener">GitHub</a>.</p>
    <p><a class="btn btn--primary" href="${base}daily/?d=${todayPuzzle.d}">Play today's challenge ${icon("arrow")}</a></p>
  </article>`,
});

// ------------------------------------------------------------------ 404 + feeds
const notFound = layout({
  base, page: "404", title: "Not found",
  description: "That page is not on the board.",
  content: `<section class="page-head center"><p class="kicker">404</p><h1 class="h1">That's a daily double<br>you can't answer.</h1><p class="section-sub">The page does not exist. The archive is still here.</p>${btn("", "Back to the board")}</section>`,
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
await writePage("index.html", home);
await writePage("daily/index.html", dailyPage);
await writePage("daily/archive/index.html", archivePage);
await writePage("study/index.html", studyPage);
await writePage("endless/index.html", endlessPage);
await writePage("archive/index.html", archiveSearch);
await writePage("about/index.html", aboutPage);
await writePage("404.html", notFound);

console.log(`built ${urls.length} pages → ${path.relative(ROOT, OUT)}`);
console.log(`topics: ${site.topics.length}, facts: ${site.stats.facts}, clues: ${site.stats.cluesMined}`);
console.log(`base: ${BASE}`);
