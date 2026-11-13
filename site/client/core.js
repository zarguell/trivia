/** Pure quiz logic shared by the browser app and the tests. No DOM, no deps. */

export function normAnswer(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/^(what|who|where|when|which)\s+(is|are|was|were)\s+/, "")
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Accept exact answers, close spelling, and the surname of a full name. */
export function isRight(given, correct) {
  const g = normAnswer(given);
  const c = normAnswer(correct);
  if (!g) return false;
  if (g === c) return true;
  const gs = g.split(" ").filter(Boolean);
  const cs = c.split(" ").filter(Boolean);
  if (gs.length < cs.length && gs.every((t) => cs.includes(t))) {
    const longest = Math.max(...gs.map((t) => t.length));
    if (gs.length >= 2 || longest >= 5) return true;
  }
  const dist = levenshtein(g, c);
  if (c.length >= 12 && dist <= 2) return true;
  if (c.length >= 6 && dist <= 1) return true;
  return false;
}

export function pluralOk(given, correct) {
  return normAnswer(given).replace(/s$/, "") === normAnswer(correct).replace(/s$/, "");
}

export function isAnswer(given, correct) {
  return isRight(given, correct) || pluralOk(given, correct);
}

/** Rough answer shape, used to keep multiple-choice distractors plausible. */
export function shape(s) {
  const c = String(s).replace(/^\([^)]*\)\s*/, "").replace(/^(the|a|an)\s+/i, "").trim();
  if (/^\d/.test(c)) return "num";
  if (/^[A-Z][a-z'’-]+\s+[A-Z]/.test(c)) return "name";
  if (/^[A-Z]/.test(c)) return "proper";
  return "common";
}

export function optionsFor(clue, pool, rng = Math.random) {
  const target = clue.a;
  const s = shape(target);
  const targetLen = target.length;
  const targetNorm = normAnswer(target);
  const seen = new Set([targetNorm]);
  const candidates = [];
  for (const c of pool) {
    const answer = String(c.a || "").trim();
    const n = normAnswer(answer);
    if (!n || n.length < 3 || seen.has(n)) continue;
    if (answer.toLowerCase() === target.toLowerCase()) continue;
    if (targetNorm.includes(n) || n.includes(targetNorm)) continue;
    seen.add(n);
    candidates.push({
      a: answer,
      same: shape(answer) === s,
      sameType: Boolean(clue.at) && c.at === clue.at,
      len: Math.abs(answer.length - targetLen),
      tokens: Math.abs(answer.split(/\s+/).length - target.split(/\s+/).length),
    });
  }
  const typed = candidates.filter((c) => c.sameType);
  const strict = candidates.filter((c) => c.same);
  const base = typed.length >= 3 ? typed : strict.length >= 3 ? strict : candidates;
  const ranked = base.sort(
    (x, y) => x.len - y.len || x.tokens - y.tokens,
  );
  const pick = [];
  const used = new Set([targetNorm]);
  for (const c of shuffled(ranked.slice(0, 60), rng)) {
    const n = normAnswer(c.a);
    if (used.has(n)) continue;
    used.add(n);
    pick.push(c.a);
    if (pick.length === 3) break;
  }
  return shuffled([target, ...pick], rng);
}

export function shuffled(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
