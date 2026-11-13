"""Mine the clue corpus into per-topic dossiers.

A dossier is the evidence a curator needs to write the handful of associations
Jeopardy actually tests for a topic: how often it appears, what it is usually the
answer to, which responses cluster around it, and representative real clues.
"""
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import clean, key  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "data" / "work"
DOSSIERS = WORK / "dossiers"

STOP = set("""a an the and or but of in on at to for from by with without into over under
about after before between during through is are was were be been being has have had do
does did will would can could should may might must this that these those it its it's
he she they them his her their you your i we our who whom whose which what when where why
how not no yes all any some more most other such only own same so than too very just also
one two three four five six seven eight nine ten first last new old name named called known
said says say like well back even still up down out off again here there then now
""".split())

TOKEN_RX = re.compile(r"[a-z0-9][a-z0-9'’-]*")


def tokens(text: str) -> list[str]:
    out = []
    for t in TOKEN_RX.findall(clean(text).lower()):
        t = t.strip("'’-")
        if t.endswith("'s"):
            t = t[:-2]
        if len(t) >= 2 and t not in STOP:
            out.append(t)
    return out


def match_tokens(text: str) -> list[str]:
    """Tokens for mention matching: keeps short words, strips possessives."""
    out = []
    for t in TOKEN_RX.findall(clean(text).lower()):
        t = t.strip("'’-")
        if t.endswith("'s"):
            t = t[:-2]
        if t:
            out.append(t)
    return out


class Matcher:
    """Token-sequence matcher for topic aliases. One pass over the corpus."""

    def __init__(self, topics):
        self.index = defaultdict(list)
        for t in topics:
            for alias in [t["name"]] + list(t.get("aliases") or []):
                toks = match_tokens(alias.replace("&", " and "))
                if not toks or len(toks) > 8:
                    continue
                self.index[toks[0]].append((tuple(toks), t["slug"]))
        for k in self.index:
            self.index[k].sort(key=lambda x: -len(x[0]))

    def match(self, text: str) -> set[str]:
        toks = match_tokens(text.replace("&", " and "))
        hits = set()
        n = len(toks)
        for i, tok in enumerate(toks):
            for seq, slug in self.index.get(tok, ()):
                L = len(seq)
                if i + L <= n and tuple(toks[i:i + L]) == seq:
                    hits.add(slug)
        return hits


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:80]


def settle(text: str, aliases: list[str]) -> str:
    t = " " + clean(text).lower() + " "
    for a in sorted(aliases, key=len, reverse=True):
        if len(a) >= 4:
            t = re.sub(r"(?<![a-z0-9])" + re.escape(a.lower()) + r"(?![a-z0-9])", " ", t)
    return t


def dedupe_examples(items, limit=12):
    seen, out = set(), []
    for c in items:
        sig = (c["answer_key"], " ".join(clean(c["clue"]).lower().split()[:8]))
        if sig in seen:
            continue
        seen.add(sig)
        out.append(c)
        if len(out) >= limit:
            break
    return out


class Corpus:
    def __init__(self, path: Path):
        self.clues = [json.loads(line) for line in open(path, encoding="utf-8")]
        self.df = Counter()
        for c in self.clues:
            for t in set(tokens(c["clue"])):
                self.df[t] += 1
        self.n = len(self.clues)
        self.by_response = defaultdict(list)
        for i, c in enumerate(self.clues):
            self.by_response[c["answer_key"]].append(i)

    def idf(self, term: str) -> float:
        return math.log((self.n + 1) / (self.df.get(term, 0) + 1))


def build_dossier(corpus: Corpus, topic, mention_ids: set[int]):
    name = topic["name"]
    aliases = list(topic.get("aliases") or [])
    answer_ids = set()
    for a in [name] + aliases:
        answer_ids.update(corpus.by_response.get(key(a), []))
    all_ids = answer_ids | mention_ids
    if len(all_ids) < 8:
        return None
    rows = [corpus.clues[i] for i in all_ids]
    as_answer = [corpus.clues[i] for i in sorted(answer_ids)]

    deck_counts = Counter(c["deck"] for c in rows)
    deck = topic.get("deck") or deck_counts.most_common(1)[0][0]
    dates = sorted(c["date"] for c in rows if c["date"])
    cats = Counter(c["category"].title() for c in rows)

    term_counts = Counter()
    for c in as_answer:
        for t in set(tokens(settle(c["clue"], [name] + aliases))):
            term_counts[t] += 1
    terms = [
        {"term": t, "n": n, "idf": round(corpus.idf(t), 2)}
        for t, n in term_counts.most_common(80)
        if corpus.idf(t) > 2.0
    ][:28]

    assoc, assoc_rows = Counter(), defaultdict(list)
    answer_id_set = set(answer_ids)
    for i in mention_ids - answer_id_set:
        c = corpus.clues[i]
        assoc[c["answer_key"]] += 1
        assoc_rows[c["answer_key"]].append(c)
    associations = []
    for ak, n in assoc.most_common(16):
        ex = sorted(assoc_rows[ak], key=lambda c: c["date"])[-3:]
        associations.append({
            "answer": ex[-1]["response"], "n": n,
            "examples": [{"id": c["id"], "clue": c["clue"], "date": c["date"]} for c in ex],
        })

    by_answer = defaultdict(list)
    for c in rows:
        by_answer[c["answer_key"]].append(c)
    reps = []
    for ak, group in sorted(by_answer.items(), key=lambda kv: -len(kv[1])):
        group.sort(key=lambda c: (c["round"] != 3, -len(c["clue"]), c["date"]))
        reps.extend(dedupe_examples(group, 3))
        if len(reps) >= 30:
            break

    decades = Counter(c["date"][:3] + "0s" for c in rows if c["date"])
    return {
        "name": name,
        "key": key(name),
        "slug": topic["slug"],
        "deck": deck,
        "aliases": aliases,
        "count": len(rows),
        "as_answer": len(as_answer),
        "as_mention": len(mention_ids),
        "first": dates[0] if dates else None,
        "last": dates[-1] if dates else None,
        "deck_counts": deck_counts.most_common(),
        "categories": [{"name": k, "n": v} for k, v in cats.most_common(10)],
        "terms": terms,
        "associations": associations,
        "decades": sorted(decades.items()),
        "examples": [
            {
                "id": c["id"], "clue": c["clue"], "response": c["response"],
                "category": c["category"].title(), "round": c["round"],
                "date": c["date"], "value": c["value"],
            }
            for c in reps
        ],
    }


def main():
    corpus = Corpus(WORK / "clues.jsonl")
    seeds_path = WORK / "seeds.json"
    seeds = json.load(open(seeds_path)) if seeds_path.exists() else []

    topics, seen = [], set()
    for s in seeds:
        k = key(s["name"])
        if k in seen:
            continue
        seen.add(k)
        topics.append({**s, "slug": slugify(s["name"])})
    for k, n in Counter(c["answer_key"] for c in corpus.clues).most_common(500):
        if k in seen or n < 30:
            continue
        seen.add(k)
        name = next(c["response"] for c in corpus.clues if c["answer_key"] == k)
        topics.append({"name": name, "aliases": [], "deck": None, "slug": slugify(name)})

    print(f"matching {len(topics)} topics across {corpus.n:,} clues...", flush=True)
    matcher = Matcher(topics)
    mentions = defaultdict(set)
    for i, c in enumerate(corpus.clues):
        for slug in matcher.match(c["clue"]):
            mentions[slug].add(i)
        if i and i % 100000 == 0:
            print(f"  scanned {i:,}", flush=True)

    DOSSIERS.mkdir(parents=True, exist_ok=True)
    index = []
    for t in topics:
        d = build_dossier(corpus, t, mentions.get(t["slug"], set()))
        if not d:
            continue
        (DOSSIERS / f"{d['slug']}.json").write_text(
            json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        index.append({k: d[k] for k in (
            "name", "slug", "deck", "count", "as_answer", "as_mention", "first", "last")})
    index.sort(key=lambda d: -d["count"])
    (WORK / "entities.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(index)} dossiers")


if __name__ == "__main__":
    main()
