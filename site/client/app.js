/* Six Things — client game engine. No framework, no build step. */
import { normAnswer, isAnswer, optionsFor, shuffled, categoryRevealsAnswer } from "./core.js";

const BASE = document.documentElement.dataset.base || "/trivia/";
const STORE = "sixthings.v1";
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAY_VALUES = [200, 400, 600, 800, 1000, 1200];
const FINAL_VALUE = 2000;

// ---------------------------------------------------------------- storage
const defaults = () => ({
  theme: null, daily: {}, facts: {},
  endless: { best: 0, correct: 0, total: 0 }, lastDeck: null,
  learn: { scope: "all", size: 10, filter: "all" },
});
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
const shortDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric",
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

function clueMeta(item) {
  const hideCategory = categoryRevealsAnswer(item.k, item.a);
  return `<div class="quiz-meta">
    ${item.badge ? `<b>${esc(item.badge)}</b><span>·</span>` : ""}
    ${hideCategory ? "" : `<span>${esc(item.k)}</span><span>·</span>`}
    <span>${esc(item.d.slice(0, 4))}</span>
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
  let interacted = false;

  function render() {
    locked = false;
    if (idx >= items.length) return finish();
    opts.onRender?.(idx);
    const item = items[idx];
    container.innerHTML = `<div class="quiz-card">
      <div class="quiz-top">${clueMeta(item)}${dotsHTML(items, results, idx)}</div>
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
    const desktop = window.matchMedia("(min-width: 860px)").matches;
    if (desktop || interacted) input?.focus({ preventScroll: true });
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (locked) return;
      const given = input.value.trim();
      if (!given) { input.focus(); return; }
      locked = true;
      interacted = true;
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
    ...puzzle.clues.map((c, i) => ({ ...c, v: DAY_VALUES[i] })),
    { ...puzzle.final, badge: "Final", v: FINAL_VALUE },
  ];
  const saved = state.daily[date];

  const dateEl = $("[data-daily-date]");
  const topicEl = $("[data-daily-topic]");
  const deckEl = $("[data-daily-deck]");
  const linkEl = $("[data-daily-topic-link]");
  const stepEl = $("[data-daily-step]");
  const barEl = $("[data-daily-progress]");
  const barWrap = $("[data-daily-progressbar]");
  if (dateEl) dateEl.textContent = shortDate(date);
  if (topicEl) topicEl.textContent = puzzle.tn;
  if (deckEl) deckEl.textContent = puzzle.td || "";
  if (linkEl) linkEl.href = `${BASE}topic/${puzzle.t}/`;
  const setStep = (n) => {
    if (stepEl) stepEl.textContent = n >= 7 ? "Complete" : `Question ${Math.min(n + 1, 7)} of 7`;
    if (barEl) barEl.style.width = `${Math.min(100, (n / 7) * 100)}%`;
    barWrap?.setAttribute("aria-valuenow", String(Math.min(n, 7)));
  };

  if (saved?.done) {
    setStep(7);
    renderSummary(saved);
    renderStreak();
    return;
  }

  const results = saved?.results || [];
  const startIdx = results.filter(Boolean).length;
  setStep(startIdx);
  renderStreak();
  runQuiz(app, items, {
    start: startIdx,
    results,
    onRender(idx) { setStep(idx); },
    onProgress(step, all) {
      state.daily[date] = { results: all, done: false, step };
      save();
    },
    onFinish(all) {
      const done = { results: all, done: true };
      state.daily[date] = done;
      save();
      setStep(7);
      renderStreak();
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
      el.hidden = known === 0;
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
    b.textContent = open ? "Hide clues" : "Show clues";
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
    section.scrollIntoView({ block: "start" });
    $(".input", box)?.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------- endless
async function initEndless() {
  const app = $("#endless-app");
  if (!app) return;
  const select = $("#deck-select");
  const record = $("[data-endless-record]");
  const hasDeck = (d) => !!select && [...select.options].some((o) => o.value === d);
  let pool = [], deck = state.lastDeck, seen = new Set(), streak = 0;

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
    if (select) select.value = d;
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
        <div class="quiz-meta">
          ${categoryRevealsAnswer(clue.k, clue.a) ? "" : `<b>${esc(clue.k)}</b><span>·</span>`}
          <span>${esc(clue.d.slice(0, 4))}</span>
        </div>
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
      if (ok) {
        streak += 1;
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

  select?.addEventListener("change", () => load(select.value));
  const initial = deck && hasDeck(deck) ? deck : "potpourri";
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
      results.innerHTML = `<div class="empty"><p class="empty__title">No matches.</p><p>Try the answer itself, or a shorter phrase.</p></div>`;
      return;
    }
    results.innerHTML = rows.slice(0, 80).map((r, i) => `<article class="result">
      <p class="result__clue">${hl(r.c, query)}</p>
      <div class="result__row">
        <span>${esc(r.k)} · ${esc(r.d)}${r.v ? ` · $${r.v}` : ""}</span>
        <span class="result__a">${hideAnswers ? `<button type="button" data-reveal="${i}">reveal</button>` : `<span>${hl(r.a, query)}</span>`}</span>
      </div>
    </article>`).join("");
    $$("[data-reveal]", results).forEach((b) => b.addEventListener("click", () => {
      b.outerHTML = `<span>${esc(current[Number(b.dataset.reveal)]?.a || "")}</span>`;
    }));
  }

  async function search(q) {
    const query = q.trim().toLowerCase();
    if (query.length < 2) {
      results.innerHTML = `<div class="empty"><p class="empty__title">Type at least two characters.</p></div>`;
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
    countEl.textContent = `${rows.length.toLocaleString("en-US")} clues match “${q.trim()}”.`;
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
    countEl.textContent = "Random clue.";
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
  $$(".topic-row[data-topic]").forEach((card) => {
    const total = Number(card.dataset.facts) || 0;
    const fs = state.facts[card.dataset.topic] || {};
    const known = Object.values(fs).filter(Boolean).length;
    const m = $("[data-mastery]", card);
    if (!m) return;
    if (!known) {
      m.hidden = true;
      return;
    }
    m.hidden = false;
    $(".mastery__bar i", m).style.width = `${total ? Math.round((known / total) * 100) : 0}%`;
    $(".mastery__label", m).textContent = `${known}/${total}`;
  });
}

// ---------------------------------------------------------------- learn
function maskFact(fact) {
  const rxFor = (t, flags = "i") => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, flags);
  };
  const terms = (fact.a || [])
    .filter((t) => t && t.length >= 3)
    .sort((a, b) => b.length - a.length);
  let term = null;
  // Prefer the fact's own label; associations are the fallback cue.
  if (fact.l && fact.l.length >= 3 && rxFor(fact.l).test(fact.s)) term = fact.l;
  else {
    for (const t of terms) {
      if (rxFor(t).test(fact.s)) { term = t; break; }
    }
  }
  if (!term) return { html: esc(fact.s), masked: false };
  const rx = rxFor(term, "gi");
  const text = fact.s.replace(rx, "\u0000");
  return {
    html: esc(text).replace(/\u0000/g, '<span class="learn-blank" aria-label="blank"></span>'),
    masked: true,
  };
}

async function initLearn() {
  const app = $("#learn-app");
  if (!app) return;
  let facts;
  try { facts = await fetchJSON("data/learn.json"); }
  catch { app.innerHTML = `<div class="notice">Could not load the learn deck.</div>`; return; }

  const opts = { scope: "all", size: 10, filter: "all", ...(state.learn || {}) };
  const decks = [...new Map(facts.map((f) => [f.d, f.dn])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  if (opts.scope !== "all" && !decks.some(([id]) => id === opts.scope)) opts.scope = "all";
  if (![5, 10, 15, 20].includes(Number(opts.size))) opts.size = 10;
  if (!["all", "new"].includes(opts.filter)) opts.filter = "all";
  opts.size = Number(opts.size);

  let preview = [];
  let session = null;
  const focusTop = () => app.scrollIntoView({ block: "start", behavior: "instant" });
  const learned = (f) => !!(state.facts?.[f.t]?.[f.f]);
  const pool = () => facts.filter((f) =>
    (opts.scope === "all" || f.d === opts.scope) &&
    (opts.filter === "all" || !learned(f)));
  const draw = () => {
    const p = pool();
    preview = shuffled(p).slice(0, Math.min(opts.size, p.length));
    return preview;
  };
  const persist = () => { state.learn = { ...opts }; save(); };
  const markKnown = (f) => {
    if (!state.facts[f.t]) state.facts[f.t] = {};
    state.facts[f.t][f.f] = true;
    save();
  };

  function renderSetup() {
    session = null;
    app.innerHTML = `<div class="learn-setup">
      <div class="learn-fields">
        <label class="field"><span>Category</span>
          <select class="select" id="learn-scope">
            <option value="all"${opts.scope === "all" ? " selected" : ""}>All topics</option>
            ${decks.map(([id, name]) => `<option value="${esc(id)}"${opts.scope === id ? " selected" : ""}>${esc(name)}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>Cards</span>
          <select class="select" id="learn-size">
            ${[5, 10, 15, 20].map((n) => `<option value="${n}"${opts.size === n ? " selected" : ""}>${n}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>Facts</span>
          <select class="select" id="learn-filter">
            <option value="all"${opts.filter === "all" ? " selected" : ""}>All facts</option>
            <option value="new"${opts.filter === "new" ? " selected" : ""}>Not yet learned</option>
          </select>
        </label>
      </div>
      <div class="learn-preview" data-learn-preview></div>
      <div class="learn-actions">
        <button class="btn btn--primary" type="button" id="learn-start">Start</button>
        <button class="btn btn--ghost" type="button" id="learn-shuffle">Shuffle</button>
      </div>
    </div>`;

    const paint = () => {
      const target = $("[data-learn-preview]", app);
      const topics = [...new Set(preview.map((f) => f.n))];
      if (!preview.length) {
        target.innerHTML = `<span>No facts match these filters.</span>`;
      } else {
        target.innerHTML = `<span>${preview.length} fact${preview.length === 1 ? "" : "s"} · ${topics.length} topic${topics.length === 1 ? "" : "s"}</span>
          <span class="learn-preview__topics">${esc(topics.slice(0, 5).join(" · "))}${topics.length > 5 ? " · …" : ""}</span>`;
      }
      const start = $("#learn-start", app);
      start.disabled = !preview.length;
      start.textContent = preview.length ? `Start ${preview.length} card${preview.length === 1 ? "" : "s"}` : "Start";
      $("#learn-shuffle", app).disabled = !preview.length;
    };
    paint();

    $("#learn-scope").addEventListener("change", (e) => {
      opts.scope = e.target.value; persist(); draw(); paint();
    });
    $("#learn-size").addEventListener("change", (e) => {
      opts.size = Number(e.target.value); persist(); draw(); paint();
    });
    $("#learn-filter").addEventListener("change", (e) => {
      opts.filter = e.target.value; persist(); draw(); paint();
    });
    $("#learn-start").addEventListener("click", () => start(preview));
    $("#learn-shuffle").addEventListener("click", () => { draw(); paint(); });
  }

  function renderCard() {
    if (session.idx >= session.order.length) {
      if (session.retry.length && !session.retried) {
        session.order = shuffled(session.retry);
        session.retry = [];
        session.retried = true;
        session.review = true;
        session.idx = 0;
        session.flipped = false;
      } else {
        return renderQuiz();
      }
    }
    const fact = session.order[session.idx];
    const mask = maskFact(fact);
    const front = mask.masked
      ? mask.html
      : `What do you know about ${esc(fact.l)}?`;
    const givesAway = fact.l && fact.n.toLowerCase().includes(fact.l.toLowerCase());
    const topicLine = givesAway ? esc(fact.dn) : `${esc(fact.n)} · ${esc(fact.dn)}`;
    const progress = Math.round((session.idx / session.order.length) * 100);
    const more = session.order.length - session.idx - 1;
    app.innerHTML = `<div class="learn-toolbar">
        <span>${session.review ? "Review" : "Card"} ${session.idx + 1} of ${session.order.length}</span>
        <span class="learn-tools">
          <button class="link-quiet" type="button" id="learn-shuffle-remaining"${more ? "" : " disabled"}>Shuffle</button>
          <button class="link-quiet" type="button" id="learn-exit">Exit</button>
        </span>
      </div>
      <div class="learn-progress" role="progressbar" aria-label="Card progress" aria-valuemin="0" aria-valuemax="${session.order.length}" aria-valuenow="${session.idx}">
        <i style="width:${progress}%"></i>
      </div>
      <p class="learn-note" id="learn-note"></p>
      <div class="learn-card" id="learn-card" role="button" tabindex="0" aria-expanded="false" aria-label="Flashcard. Press Enter to reveal.">
        <div class="learn-card__inner">
          <div class="learn-card__face learn-card__front">
            <p class="learn-card__topic">${topicLine}</p>
            <p class="learn-card__statement">${front}</p>
            <p class="learn-card__hint">Tap or press Enter to reveal</p>
          </div>
          <div class="learn-card__face learn-card__back" aria-hidden="true">
            <p class="learn-card__label">${esc(fact.l)}</p>
            <p class="learn-card__statement">${esc(fact.s)}</p>
            <div class="chips">${(fact.a || []).map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</div>
            ${fact.c ? `<p class="learn-card__clue">“${esc(fact.c.c)}” <span>${esc(fact.c.k)} · ${esc(fact.c.d.slice(0, 4))}</span></p>` : ""}
          </div>
        </div>
      </div>
      <div class="learn-actions">
        <button class="btn btn--ghost" type="button" id="learn-show">Show answer</button>
        <div class="learn-rating" hidden>
          <button class="btn btn--ghost" type="button" id="learn-again">Again</button>
          <button class="btn btn--primary" type="button" id="learn-got">Got it</button>
        </div>
      </div>`;

    const card = $("#learn-card", app);
    const show = $("#learn-show", app);
    const rating = $(".learn-rating", app);
    const flip = () => {
      if (session.flipped) return;
      session.flipped = true;
      card.classList.add("is-flipped");
      card.setAttribute("aria-expanded", "true");
      $(".learn-card__front", card)?.setAttribute("aria-hidden", "true");
      $(".learn-card__back", card)?.setAttribute("aria-hidden", "false");
      show.hidden = true;
      rating.hidden = false;
      $("#learn-got", app)?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        const rect = rating.getBoundingClientRect();
        const clear = window.innerHeight - 74;
        if (rect.bottom > clear) {
          window.scrollBy({ top: rect.bottom - clear + 8, behavior: "smooth" });
        }
      });
    };
    card.addEventListener("click", flip);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
    });
    show.addEventListener("click", flip);

    const rate = (ok) => {
      session.ratings.push({ fact, ok });
      if (ok) markKnown(fact);
      else session.retry.push(fact);
      session.idx += 1;
      session.flipped = false;
      renderCard();
    };
    $("#learn-again", app).addEventListener("click", () => rate(false));
    $("#learn-got", app).addEventListener("click", () => rate(true));

    $("#learn-shuffle-remaining", app)?.addEventListener("click", () => {
      const rest = session.order.slice(session.idx + 1);
      if (!rest.length) return;
      session.order = session.order.slice(0, session.idx + 1).concat(shuffled(rest));
      $("#learn-note", app).textContent = "Remaining cards shuffled.";
    });
    $("#learn-exit", app)?.addEventListener("click", () => { draw(); renderSetup(); focusTop(); });
    focusTop();
  }

  function renderQuiz() {
    const items = [];
    const seen = new Set();
    for (const fact of session.facts) {
      if (!fact.c || seen.has(fact.c.id)) continue;
      seen.add(fact.c.id);
      items.push({ ...fact.c, fact });
    }
    if (!items.length) {
      app.innerHTML = `<div class="notice">No quiz clues for this set. <button class="inline-link" type="button" id="learn-options">Change options</button></div>`;
      $("#learn-options", app).addEventListener("click", () => { draw(); renderSetup(); });
      return;
    }
    const quizItems = shuffled(items);
    app.innerHTML = `<div class="section-head"><h2>Recall</h2><span class="screen-meta">${quizItems.length} question${quizItems.length === 1 ? "" : "s"}</span></div>
      <div class="quiz" data-quiz></div>`;
    runQuiz($("[data-quiz]", app), quizItems, {
      onFinish(results) { renderSummary(results, quizItems); },
    });
    focusTop();
  }

  function renderSummary(results, quizItems) {
    const correct = results.filter((r) => r?.ok).length;
    const marked = new Set(session.ratings.filter((r) => r.ok).map((r) => `${r.fact.t}:${r.fact.f}`)).size;
    const totalCards = session.facts.length;
    const pct = results.length ? Math.round((correct / results.length) * 100) : 0;
    app.innerHTML = `<div class="quiz-card score-card learn-summary">
      <p class="kicker">Recall</p>
      <p class="score">${correct} / ${results.length}</p>
      <p class="verdict">${pct === 100 ? "The associations held." : pct >= 70 ? "Close. Review the ones that slipped." : "Run the cards again, then retry."}</p>
      <p class="fine">Cards marked known: ${marked} / ${totalCards}</p>
      <div class="review">
        ${results.map((r, i) => {
          const it = quizItems[i];
          const label = it.fact.l && it.fact.l.toLowerCase() !== it.fact.n.toLowerCase()
            ? `<small class="review__fact">${esc(it.fact.l)}</small>` : "";
          return `<div><span>${esc(it.fact.n)}${label}</span><span>${r?.ok ? "✓" : "✗"} ${esc(it.a)}</span></div>`;
        }).join("")}
      </div>
      <div class="cta-row">
        <button class="btn btn--primary" type="button" id="learn-new">New shuffle</button>
        <button class="btn btn--ghost" type="button" id="learn-review">Review cards</button>
        <a class="btn btn--ghost" href="${BASE}study/">Back to Study</a>
      </div>
      <p class="fine" style="margin-top:14px"><button class="inline-link" type="button" id="learn-options">Change options</button></p>
    </div>`;
    $("#learn-new", app).addEventListener("click", () => {
      draw();
      if (!preview.length) { renderSetup(); return; }
      start(preview);
    });
    $("#learn-review", app).addEventListener("click", () => start(session.facts));
    $("#learn-options", app).addEventListener("click", () => { draw(); renderSetup(); focusTop(); });
    focusTop();
  }

  function start(selected) {
    if (!selected?.length) return;
    session = {
      facts: [...selected], order: shuffled(selected), idx: 0,
      flipped: false, ratings: [], retry: [], retried: false, review: false,
    };
    renderCard();
  }

  draw();
  renderSetup();
  if (new URLSearchParams(location.search).get("shuffle") === "1") start(preview);
}

// ---------------------------------------------------------------- keyboard
const isAnswerField = (el) => !!el && el.matches && el.matches(".input");
document.addEventListener("focusin", (e) => {
  if (isAnswerField(e.target)) document.body.classList.add("keyboard-open");
});
document.addEventListener("focusout", (e) => {
  if (!isAnswerField(e.target)) return;
  setTimeout(() => {
    if (!isAnswerField(document.activeElement)) document.body.classList.remove("keyboard-open");
  }, 150);
});

// ---------------------------------------------------------------- boot
if (document.body.dataset.page === "daily") initDaily();
if (document.body.dataset.page === "deck") initDeck();
if (document.body.dataset.page === "topic") initTopic();
if (document.body.dataset.page === "learn") initLearn();
if (document.body.dataset.page === "endless") initEndless();
if (document.body.dataset.page === "archive") initArchive();
