/* Six Things — client game engine. No framework, no build step. */
import { normAnswer, isAnswer, optionsFor, shuffled } from "./core.js";

const BASE = document.documentElement.dataset.base || "/trivia/";
const STORE = "sixthings.v1";
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAY_VALUES = [200, 400, 600, 800, 1000, 1200];
const FINAL_VALUE = 2000;

// ---------------------------------------------------------------- storage
const defaults = () => ({ theme: null, daily: {}, facts: {}, endless: { best: 0, correct: 0, total: 0 }, lastDeck: null });
let state;
try { state = { ...defaults(), ...JSON.parse(localStorage.getItem(STORE) || "{}") }; }
catch { state = defaults(); }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* private mode */ }
}

// ---------------------------------------------------------------- utils
const pad = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const prettyDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric",
});
const years = (s) => s.slice(0, 4);
const cache = new Map();
async function fetchJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`${BASE}${path}`, { credentials: "same-origin" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
  });
  cache.set(path, p);
  return p;
}
const shuffle = (a) => shuffled(a);

// ---------------------------------------------------------------- theme
const metaTheme = $('meta[name="theme-color"]');
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  state.theme = t;
  save();
  if (metaTheme) metaTheme.content = t === "light" ? "#f6f2e8" : "#080d18";
}
$$('[data-action="theme"]').forEach((b) => b.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
}));

// ---------------------------------------------------------------- shared quiz UI
function dotsHTML(items, results, idx) {
  return `<div class="dots" aria-hidden="true">${items.map((_, i) => {
    const r = results[i];
    return `<i class="${r ? (r.ok ? "is-done" : "is-bad") : i === idx ? "is-now" : ""}"></i>`;
  }).join("")}</div>`;
}

function clueMeta(item, i, total) {
  return `<div class="quiz-meta">
    <b>${item.badge || `${i + 1} / ${total}`}</b>
    <span>·</span><span>${esc(item.k)}</span>
    <span>·</span><span>${esc(item.d.slice(0, 4))}</span>
    ${item.v ? `<span>·</span><span>$${item.v}</span>` : ""}
  </div>`;
}

function feedbackHTML(item, result, isLast) {
  const cls = result.ok ? "is-correct" : "is-wrong";
  return `<div class="feedback ${cls}" role="status">
    <div class="feedback__head">${result.ok ? "Correct" : "Not quite"}</div>
    <p>Answer: <span class="answer">${esc(item.a)}</span></p>
    <p class="src">${esc(item.k)} · ${esc(item.d)}${item.v ? ` · $${item.v}` : ""}</p>
    <div class="feedback__actions">
      ${result.ok ? "" : `<button class="btn btn--ghost btn--sm" type="button" data-action="override">I had it right</button>`}
      <button class="btn btn--primary btn--sm" type="button" data-action="next" autofocus>${isLast ? "See results" : "Next clue"}</button>
    </div>
  </div>`;
}

function runQuiz(container, items, opts = {}) {
  let idx = opts.start ?? 0;
  const results = opts.results ? [...opts.results] : [];
  let locked = false;

  function render() {
    locked = false;
    if (idx >= items.length) return finish();
    const item = items[idx];
    container.innerHTML = `<div class="quiz-card">
      <div class="quiz-top">${clueMeta(item, idx, items.length)}${dotsHTML(items, results, idx)}</div>
      <p class="clue-text">${esc(item.c)}</p>
      <form class="answer-form" autocomplete="off" novalidate>
        <label class="sr-only" for="answer-${idx}">Your answer</label>
        <input class="input" id="answer-${idx}" name="answer" placeholder="Type your answer…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send">
        <button class="btn btn--primary" type="submit">Submit</button>
      </form>
      <div class="feedback-slot"></div>
    </div>`;
    const form = $("form", container);
    const input = $(".input", container);
    input?.focus({ preventScroll: true });
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (locked) return;
      const given = input.value.trim();
      if (!given) { input.focus(); return; }
      locked = true;
      const ok = isAnswer(given, item.a);
      results[idx] = { ok, given, override: false };
      opts.onProgress?.(idx, results);
      $(".feedback-slot", container).innerHTML = feedbackHTML(item, results[idx], idx === items.length - 1);
      form.hidden = true;
      bindFeedback(item, results[idx]);
      $('.feedback [data-action="next"]')?.focus({ preventScroll: true });
    });
  }

  function bindFeedback(item, result) {
    const slot = $(".feedback-slot", container);
    $('[data-action="next"]', slot)?.addEventListener("click", () => {
      idx += 1;
      opts.onProgress?.(idx, results);
      render();
    });
    $('[data-action="override"]', slot)?.addEventListener("click", () => {
      result.ok = true;
      result.override = true;
      opts.onProgress?.(idx, results);
      slot.innerHTML = feedbackHTML(item, result, idx === items.length - 1);
      bindFeedback(item, result);
      $('.feedback [data-action="next"]')?.focus({ preventScroll: true });
    });
  }

  function finish() {
    opts.onFinish?.(results);
  }

  render();
  return { render, get idx() { return idx; }, results };
}

// ---------------------------------------------------------------- home
async function initHome() {
  const card = $("#home-daily");
  if (!card) return;
  const date = todayISO();
  try {
    const rows = await fetchJSON(`data/daily/${years(date)}.json`);
    const p = rows.find((r) => r.d === date);
    if (!p) return;
    card.dataset.date = p.d;
    $("[data-daily-date]", card).textContent = prettyDate(p.d);
    $("[data-daily-topic]", card).textContent = p.tn;
    $("[data-daily-hook]", card).textContent = p.th;
    const link = $("[data-daily-link]", card);
    link.href = `${BASE}daily/?d=${p.d}`;
    const result = state.daily[p.d];
    if (result?.done) {
      link.innerHTML = `See your result · ${result.results.filter((r) => r.ok).length}/7`;
    }
  } catch { /* keep server-rendered fallback */ }
  renderStreak();
}

function dailyStreak() {
  const days = new Set(Object.entries(state.daily).filter(([, v]) => v?.done).map(([k]) => k));
  let cursor = new Date();
  if (!days.has(todayISO())) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (true) {
    const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (!days.has(iso)) break;
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

function renderStreak() {
  const el = $("[data-streak]");
  if (!el) return;
  const n = dailyStreak();
  if (n > 0) {
    el.hidden = false;
    el.textContent = `${n}-day streak`;
  }
}

// ---------------------------------------------------------------- daily
async function initDaily() {
  const app = $("#daily-app");
  if (!app) return;
  const params = new URLSearchParams(location.search);
  let date = params.get("d") || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayISO();

  let puzzle;
  try {
    const idx = await fetchJSON("data/daily/index.json");
    if (date > idx.last) date = idx.last;
    if (date < idx.first) date = idx.first;
    const rows = await fetchJSON(`data/daily/${years(date)}.json`);
    puzzle = rows.find((r) => r.d === date);
    if (!puzzle) {
      app.innerHTML = `<div class="notice">No puzzle for ${esc(date)}. <a href="${BASE}daily/">Play today's.</a></div>`;
      return;
    }
  } catch {
    app.innerHTML = `<div class="notice">Could not load the puzzle. Try refreshing.</div>`;
    return;
  }

  const items = [
    ...puzzle.clues.map((c, i) => ({ ...c, badge: `${i + 1} / 7`, v: DAY_VALUES[i] })),
    { ...puzzle.final, badge: "Final", v: FINAL_VALUE },
  ];
  const saved = state.daily[date];
  $("#daily-sub").innerHTML = `${esc(prettyDate(date))} · <a class="inline-link" href="${BASE}topic/${puzzle.t}/">${esc(puzzle.tn)}</a>`;

  if (saved?.done) return renderSummary(saved);

  const results = saved?.results || [];
  const startIdx = results.filter(Boolean).length;
  runQuiz(app, items, {
    start: startIdx,
    results,
    onProgress(step, all) {
      state.daily[date] = { results: all, done: false, step };
      save();
    },
    onFinish(all) {
      const done = { results: all, done: true };
      state.daily[date] = done;
      save();
      renderSummary(done);
    },
  });

  function renderSummary(done) {
    const correct = done.results.filter((r) => r?.ok).length;
    const score = done.results.reduce((sum, r, i) => sum + (r?.ok ? (i < 6 ? DAY_VALUES[i] : FINAL_VALUE) : 0), 0);
    const grid = done.results.map((r) => `<span class="${r?.ok ? "ok" : "bad"}">${r?.ok ? "■" : "□"}</span>`).join("");
    app.innerHTML = `<div class="quiz-card score-card">
      <p class="kicker">${esc(prettyDate(date))}</p>
      <p class="score">${score.toLocaleString("en-US")}</p>
      <p class="verdict">${correct} of 7 correct · ${esc(puzzle.tn)}</p>
      <div class="grid-share" aria-label="${correct} of 7 correct">${grid}</div>
      <div class="cta-row" style="justify-content:center">
        <button class="btn btn--primary" type="button" data-action="share">Share result</button>
        <a class="btn btn--ghost" href="${BASE}topic/${puzzle.t}/">Study this topic</a>
        <button class="btn btn--ghost" type="button" data-action="again">Replay</button>
      </div>
      <div class="review">
        ${done.results.map((r, i) => {
          const it = items[i];
          return `<div><span>${i === 6 ? "Final" : `${i + 1}`}. ${esc(it.k)}</span><span>${r?.ok ? "✓" : "✗"} ${esc(it.a)}</span></div>`;
        }).join("")}
      </div>
      <p class="fine" style="margin-top:18px">Next: <a class="inline-link" href="${BASE}daily/archive/">past challenges</a> or <a class="inline-link" href="${BASE}endless/">endless mode</a>.</p>
    </div>`;
    $('[data-action="share"]')?.addEventListener("click", async (e) => {
      const text = `Six Things · ${date}\n${puzzle.tn}\n${grid} ${correct}/7 · ${score.toLocaleString("en-US")}\n${location.origin}${BASE}daily/?d=${date}`;
      const btn = e.currentTarget;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
      } catch {
        btn.textContent = "Couldn't copy";
      }
    });
    $('[data-action="again"]')?.addEventListener("click", () => {
      delete state.daily[date];
      save();
      location.reload();
    });
  }
}

// ---------------------------------------------------------------- topic
async function initTopic() {
  const dataEl = $("#topic-data");
  if (!dataEl) return;
  const pack = JSON.parse(dataEl.textContent);
  const facts = pack.facts || [];
  const clues = pack.clues || [];
  const factState = () => (state.facts[pack.id] ||= {});
  const knowButtons = $$('[data-action="know-fact"]');

  function paintMastery() {
    const fs = factState();
    const known = facts.filter((f) => fs[f.id]).length;
    const pct = facts.length ? known / facts.length : 0;
    $$("[data-mastery]").forEach((el) => {
      el.hidden = false;
      $(".mastery__bar i", el).style.width = `${Math.round(pct * 100)}%`;
      $(".mastery__label", el).textContent = `${known}/${facts.length} learned`;
    });
    knowButtons.forEach((b) => {
      const on = !!fs[b.dataset.factId];
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
      $("span", b).textContent = on ? "Learned" : "I knew this";
    });
  }
  knowButtons.forEach((b) => b.addEventListener("click", () => {
    const fs = factState();
    const id = b.dataset.factId;
    if (fs[id]) delete fs[id]; else fs[id] = true;
    save();
    paintMastery();
  }));
  paintMastery();

  $$('[data-action="toggle-facts"]').forEach((b) => b.addEventListener("click", () => {
    const all = $$("#main details.clue-drawer");
    const open = all.some((d) => !d.open);
    all.forEach((d) => { d.open = open; });
    b.textContent = open ? "Hide all clues" : "Show all clues";
  }));

  const section = $("#topic-quiz");
  const box = $(".quiz", section);
  $('[data-action="start-topic-quiz"]')?.addEventListener("click", () => start());
  $('[data-action="close-quiz"]')?.addEventListener("click", () => {
    section.hidden = true;
    section.scrollIntoView({ block: "nearest" });
  });

  function start() {
    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    const picked = shuffle(clues).slice(0, Math.min(8, clues.length));
    runQuiz(box, picked, {
      onFinish(results) {
        const correct = results.filter((r) => r.ok).length;
        const pct = Math.round((correct / picked.length) * 100);
        box.innerHTML = `<div class="quiz-card score-card">
          <p class="kicker">${esc(pack.name)}</p>
          <p class="score">${correct}<span style="font-size:.4em;color:var(--muted)"> / ${picked.length}</span></p>
          <p class="verdict">${pct === 100 ? "Every clue. Show-off." : pct >= 70 ? "Solid. The associations are sticking." : "Re-read the facts, then run it again."}</p>
          <div class="grid-share">${results.map((r) => `<span class="${r.ok ? "ok" : "bad"}">${r.ok ? "■" : "□"}</span>`).join("")}</div>
          <div class="cta-row" style="justify-content:center">
            <button class="btn btn--primary" type="button" data-action="again">Run it back</button>
            <a class="btn btn--ghost" href="${BASE}study/${esc(pack.deck)}/">More ${esc(pack.deck.replace("-", " "))}</a>
          </div>
        </div>`;
        $('[data-action="again"]', box).addEventListener("click", start);
      },
    });
  }
}

// ---------------------------------------------------------------- endless
async function initEndless() {
  const app = $("#endless-app");
  if (!app) return;
  const chips = $$(".chipbtn[data-deck]");
  const record = $("[data-endless-record]");
  let pool = [], deck = state.lastDeck, seen = new Set(), streak = 0, score = 0, total = 0;

  function paintRecord() {
    if (!record) return;
    record.hidden = false;
    $("[data-best]", record).textContent = state.endless.best || 0;
    $("[data-total]", record).textContent = state.endless.correct || 0;
  }
  paintRecord();

  async function load(d) {
    deck = d;
    state.lastDeck = d;
    save();
    chips.forEach((c) => c.classList.toggle("is-active", c.dataset.deck === d));
    app.innerHTML = `<div class="skeleton"><span></span><span></span><span></span></div>`;
    try {
      pool = await fetchJSON(`data/endless/${d}.json`);
    } catch {
      app.innerHTML = `<div class="notice">Couldn't load that deck.</div>`;
      return;
    }
    seen = new Set();
    next();
  }

  function next() {
    if (!pool.length) return;
    if (seen.size >= pool.length - 1) seen.clear();
    let clue;
    let guard = 0;
    do { clue = pool[Math.floor(Math.random() * pool.length)]; guard += 1; }
    while (seen.has(clue.id) && guard < 200);
    seen.add(clue.id);
    const opts = optionsFor(clue, pool);
    app.innerHTML = `<div class="quiz-card">
      <div class="quiz-top">
        <div class="quiz-meta"><b>${esc(clue.k)}</b><span>·</span><span>${esc(clue.d.slice(0, 4))}</span></div>
        <div class="endless-score"><span class="streak-n">${streak}</span><span class="fine">streak</span></div>
      </div>
      <p class="clue-text">${esc(clue.c)}</p>
      <div class="options" role="group" aria-label="Choose an answer">
        ${opts.map((o, i) => `<button class="option" type="button" data-answer="${esc(o)}"><span class="key">${i + 1}</span>${esc(o)}</button>`).join("")}
      </div>
      <div class="feedback-slot"></div>
    </div>`;
    let answered = false;
    const buttons = $$(".option", app);
    buttons.forEach((b, i) => b.addEventListener("click", () => answer(b, i)));
    function answer(btn, i) {
      if (answered) return;
      answered = true;
      const picked = btn.dataset.answer;
      const ok = isAnswer(picked, clue.a);
      total += 1;
      if (ok) {
        streak += 1; score += 1;
        state.endless.correct = (state.endless.correct || 0) + 1;
        state.endless.best = Math.max(state.endless.best || 0, streak);
      } else {
        streak = 0;
      }
      state.endless.total = (state.endless.total || 0) + 1;
      save();
      buttons.forEach((b2) => {
        b2.disabled = true;
        if (isAnswer(b2.dataset.answer, clue.a)) b2.classList.add("is-correct");
      });
      if (!ok) btn.classList.add("is-wrong");
      $(".feedback-slot", app).innerHTML = `<div class="feedback ${ok ? "is-correct" : "is-wrong"}" role="status">
        <div class="feedback__head">${ok ? "Correct" : "Missed"}</div>
        <p>Answer: <span class="answer">${esc(clue.a)}</span></p>
        <p class="src">${esc(clue.k)} · ${esc(clue.d)}${clue.t ? ` · <a class="inline-link" href="${BASE}topic/${esc(clue.t)}/">study this</a>` : ""}</p>
        <div class="feedback__actions"><button class="btn btn--primary btn--sm" type="button" data-action="next" autofocus>Next</button></div>
      </div>`;
      $('[data-action="next"]', app).focus({ preventScroll: true });
      $('[data-action="next"]', app).addEventListener("click", next);
      document.onkeydown = (e) => { if (e.key === "Enter") next(); };
      paintRecord();
    }
    document.onkeydown = (e) => {
      if (!answered && /^[1-4]$/.test(e.key)) { const b = buttons[Number(e.key) - 1]; b?.click(); }
    };
  }

  chips.forEach((c) => c.addEventListener("click", () => load(c.dataset.deck)));
  const initial = deck && chips.some((c) => c.dataset.deck === deck) ? deck : "potpourri";
  load(initial);
}

// ---------------------------------------------------------------- archive
async function initArchive() {
  const input = $("#q");
  const results = $("#results");
  if (!input || !results) return;
  const countEl = $("[data-count]");
  const hideToggle = $('[data-action="hide-answers"]');
  let hideAnswers = true;
  let manifest = null;
  let current = [];
  let seq = 0;
  const shards = new Map();

  const shardOf = (q) => {
    const n = normAnswer(q);
    const tok = (n.split(" ").filter(Boolean)[0] || "");
    const key = tok.replace(/[^a-z0-9]/g, "");
    return key.slice(0, 2) || "0";
  };
  async function loadShard(s) {
    if (shards.has(s)) return shards.get(s);
    const p = fetchJSON(`data/lookup/${s}.json`)
      .then((rows) => rows.map(([c, a, d, k]) => ({ c, a, d, k })))
      .catch(() => []);
    shards.set(s, p);
    return p;
  }
  async function ensureManifest() {
    if (!manifest) {
      manifest = await fetchJSON("data/lookup/index.json").catch(() => ({ total: 0, shards: {} }));
      countEl.textContent = `${(manifest.total || 0).toLocaleString("en-US")} clues in the archive. Each lookup fetches one small shard.`;
    }
    return manifest;
  }

  function hl(text, query) {
    if (!query) return esc(text);
    const words = query.split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!words.length) return esc(text);
    return esc(text).replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>");
  }

  function render(rows, query = "") {
    current = rows;
    if (!rows.length) {
      results.innerHTML = `<div class="empty"><p class="empty__title">No matches.</p><p>Lookup is keyed by the answer's first two letters. Try the answer itself, or a shorter phrase.</p></div>`;
      return;
    }
    results.innerHTML = rows.slice(0, 80).map((r, i) => `<article class="result">
      <p class="result__clue">${hl(r.c, query)}</p>
      <div class="result__row">
        <span>${esc(r.k)} · ${esc(r.d)}${r.v ? ` · $${r.v}` : ""}</span>
        <span class="result__a">${hideAnswers ? `<button type="button" data-reveal="${i}">tap to reveal</button>` : `<span>${hl(r.a, query)}</span>`}</span>
      </div>
    </article>`).join("");
    $$("[data-reveal]", results).forEach((b) => b.addEventListener("click", () => {
      b.outerHTML = `<span>${esc(current[Number(b.dataset.reveal)]?.a || "")}</span>`;
    }));
  }

  async function search(q) {
    const query = q.trim().toLowerCase();
    if (query.length < 2) {
      results.innerHTML = `<div class="empty"><p class="empty__title">Type two characters or more.</p></div>`;
      return null;
    }
    const shard = shardOf(query);
    const mine = ++seq;
    const rows0 = await loadShard(shard);
    await ensureManifest();
    if (mine !== seq) return null;
    const terms = query.split(/\s+/).filter(Boolean);
    const rows = [];
    for (const c of rows0) {
      const hay = `${c.c} ${c.a} ${c.k} ${c.d}`.toLowerCase();
      let ok = true;
      for (const t of terms) { if (!hay.includes(t)) { ok = false; break; } }
      if (ok) rows.push(c);
    }
    rows.sort((a, b) => {
      const an = normAnswer(a.a), bn = normAnswer(b.a);
      const aq = an === query ? 0 : an.startsWith(query) ? 1 : a.c.toLowerCase().includes(query) ? 2 : 3;
      const bq = bn === query ? 0 : bn.startsWith(query) ? 1 : b.c.toLowerCase().includes(query) ? 2 : 3;
      return aq - bq || b.d.localeCompare(a.d);
    });
    countEl.textContent = `${rows.length.toLocaleString("en-US")} of ${rows0.length.toLocaleString("en-US")} clues in the “${shard}” shard match “${q.trim()}”.`;
    render(rows, q.trim());
    return { rows, shard };
  }

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value;
    timer = setTimeout(() => search(q), 140);
  });
  input.addEventListener("focus", () => ensureManifest());
  hideToggle?.addEventListener("change", () => {
    hideAnswers = hideToggle.checked;
    render(current, input.value.trim());
  });
  $('[data-action="random-clue"]')?.addEventListener("click", async () => {
    const m = await ensureManifest();
    const shardNames = Object.keys(m.shards || {});
    if (!shardNames.length) return;
    const shard = shardNames[Math.floor(Math.random() * shardNames.length)];
    const rows = await loadShard(shard);
    if (!rows.length) return;
    const r = rows[Math.floor(Math.random() * Math.min(rows.length, 200))];
    countEl.textContent = `Random clue from the “${shard}” shard.`;
    hideAnswers = false;
    if (hideToggle) hideToggle.checked = false;
    render([r]);
    results.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $$("[data-query]").forEach((b) => b.addEventListener("click", () => {
    input.value = b.dataset.query;
    search(input.value);
  }));

  const seed = new URLSearchParams(location.search).get("q");
  if (seed) {
    input.value = seed;
    search(seed);
  } else {
    ensureManifest();
  }
}

// ---------------------------------------------------------------- deck
function initDeck() {
  $$(".topic-card[data-topic]").forEach((card) => {
    const total = Number(card.dataset.facts) || 0;
    const fs = state.facts[card.dataset.topic] || {};
    const known = Object.values(fs).filter(Boolean).length;
    const m = $("[data-mastery]", card);
    if (!m) return;
    m.hidden = false;
    $(".mastery__bar i", m).style.width = `${total ? Math.round((known / total) * 100) : 0}%`;
    $(".mastery__label", m).textContent = `${known}/${total} learned`;
  });
}

// ---------------------------------------------------------------- boot
if (document.body.dataset.page === "home") initHome();
if (document.body.dataset.page === "daily") initDaily();
if (document.body.dataset.page === "deck") initDeck();
if (document.body.dataset.page === "topic") initTopic();
if (document.body.dataset.page === "endless") initEndless();
if (document.body.dataset.page === "archive") initArchive();
