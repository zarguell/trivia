"""Turn curated packs plus the mined corpus into the compact data files the site ships.

Outputs (data/generated/):
  site.json        decks, topics, stats
  daily.json       deterministic puzzle per calendar day
  endless/*.json   quality-filtered clue pools per deck
  search.json      compact searchable clue pool (loaded only on the archive page)
"""
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import clean, key, DECK_BY_ID  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TOPICS = ROOT / "data" / "topics"
WORK = ROOT / "data" / "work"
GEN = ROOT / "data" / "generated"

BAD_CATEGORY_RX = re.compile(
    r"\b(WORDPLAY|WORD PLAY|BEFORE & AFTER|RHYME|ANAGRAM|PALINDROME|CROSSWORD|"
    r"LETTERS|SPELLING|BLANK|FILL IN|PUNCTUATION|PHOTO|PICTURE|IMAGE|VIDEO|AUDIO|"
    r"SCREEN|VISUAL|QUOTATION|QUOTE)\b", re.I)
BAD_CLUE_RX = re.compile(
    r"(which of these|all of the following|none of the above|"
    r"^name (any|one|two|three)|^how many|___)", re.I)


# ---------------------------------------------------------------- answer types
# Multiple-choice distractors are only plausible if they share the answer's kind.
# The clue's own determiner ("this country", "this king") is the strongest signal.

TYPE_HINTS = [
    ("country", r"\bthis (?:[a-z-]+ )?(?:country|nation)\b"),
    ("city", r"\bthis (?:[a-z-]+ )?(?:city|town|capital|state capital|municipality)\b"),
    ("us_state", r"\bthis (?:u\.?s\.? )?state\b(?! capital)"),
    ("person", r"\bthis (?:man|woman|king|queen|prince|princess|president|author|writer|poet|painter|artist|composer|actor|actress|singer|musician|director|scientist|inventor|explorer|general|emperor|empress|pharaoh|pope|saint|philosopher|mathematician|physicist|chemist|biologist|economist|politician|leader|dictator|sultan|shah|tsar|czar|novelist|playwright|dramatist|architect|sculptor|comic|villain|hero)\b"),
    ("work", r"\bthis (?:film|movie|book|novel|play|musical|song|album|poem|painting|sculpture|series|sitcom|show|opera|symphony|ballet|magazine|newspaper)\b"),
    ("planet", r"\bthis (?:planet|moon)\b"),
    ("element", r"\bthis (?:element|metal|gas)\b"),
    ("animal", r"\bthis (?:animal|bird|dog|cat|fish|insect|mammal|reptile|dinosaur|species)\b"),
    ("food", r"\bthis (?:food|dish|drink|cocktail|fruit|vegetable|cheese|nut|dessert)\b"),
    ("park", r"\bthis (?:national park|park)\b"),
    ("number", r"\b(?:this (?:number|year|percentage)|how many|how old)\b"),
]
TYPE_RX = [(name, re.compile(rx, re.I)) for name, rx in TYPE_HINTS]
ANSWER_TYPE = {}

CATEGORY_TYPES = [
    ("country", re.compile(r"\b(COUNTR(?:Y|IES)|NATIONS?)\b")),
    ("city", re.compile(r"\b(CIT(?:Y|IES)|CAPITALS?|TOWNS?)\b")),
    ("us_state", re.compile(r"\b(U\.?S\.? STATES?|AMERICAN STATES?)\b")),
    ("person", re.compile(r"\b(PRESIDENTS?|ACTORS?|ACTRESSES?|AUTHORS?|WRITERS?|POETS?|PAINTERS?|ARTISTS?|COMPOSERS?|SINGERS?|MUSICIANS?|DIRECTORS?|SCIENTISTS?|INVENTORS?|EXPLORERS?|KINGS?|QUEENS?|EMPERORS?|PEOPLE|PERSONALITIES|CELEBRIT(?:Y|IES)|LEADERS?)\b")),
    ("work", re.compile(r"\b(MOVIES?|FILMS?|BOOKS?|NOVELS?|PLAYS?|SONGS?|ALBUMS?|SITCOMS?|MUSICALS?|PAINTINGS?|POEMS?|OPERAS?)\b")),
    ("element", re.compile(r"\b(ELEMENTS?|PERIODIC TABLE|CHEMISTRY)\b")),
    ("planet", re.compile(r"\b(PLANETS?|SOLAR SYSTEM|ASTRONOMY)\b")),
]


def clue_type(clue, category):
    for name, rx in TYPE_RX:
        if rx.search(clue):
            return name
    for name, rx in CATEGORY_TYPES:
        if rx.search(category.upper()):
            return name
    return None


def shape_type(answer):
    if re.fullmatch(r"[\d\s.,%-]+", answer):
        return "number"
    core = re.sub(r"^\([^)]*\)\s*", "", answer).strip()
    if re.match(r"^[A-Z][a-z'\u2019-]+\s+[A-Z]", core):
        return "person"
    if re.match(r"^[A-Z]", core):
        return "proper"
    return "common"


EPOCH = date(2024, 1, 1)
DAYS = 1461  # 2024-01-01 through 2027-12-31


def difficulty(c, response_freq):
    score = 0
    if c["value"] >= 800:
        score += 1
    if c["value"] >= 1600 or c["round"] == 3:
        score += 1
    if response_freq.get(c["answer_key"], 0) <= 8:
        score += 1
    if len(c["clue"]) > 220:
        score += 1
    return max(1, min(4, score))


def clue_obj(c, dfreq, deck=None):
    return {
        "id": c["id"],
        "c": c["clue"],
        "a": c["response"],
        "d": c["date"],
        "k": c["category"].title(),
        "v": c["value"],
        "r": c["round"],
        "x": difficulty(c, dfreq),
        "deck": deck or c["deck"],
        "at": clue_type(c["clue"], c["category"]) or ANSWER_TYPE.get(c["answer_key"]) or shape_type(c["response"]),
    }


def load_packs():
    index = json.load(open(TOPICS / "index.json"))
    by_id = {t["id"]: t for t in index}
    packs = []
    for p in sorted(TOPICS.glob("*.json")):
        if p.name == "index.json":
            continue
        pack = json.load(open(p, encoding="utf-8"))
        if pack.get("skip") or "facts" not in pack:
            continue
        packs.append(pack)
    return by_id, packs


def main():
    corpus = [json.loads(line) for line in open(WORK / "clues.jsonl", encoding="utf-8")]
    by_id = {c["id"]: c for c in corpus}
    response_freq = Counter(c["answer_key"] for c in corpus)
    type_votes = defaultdict(Counter)
    for c in corpus:
        t = clue_type(c["clue"], c["category"])
        if t:
            type_votes[c["answer_key"]][t] += 1
    ANSWER_TYPE.clear()
    for ak, votes in type_votes.items():
        t, n = votes.most_common(1)[0]
        if n >= 2 and n / sum(votes.values()) >= 0.5:
            ANSWER_TYPE[ak] = t
    index, packs = load_packs()
    pack_by_id = {p["id"]: p for p in packs}

    GEN.mkdir(parents=True, exist_ok=True)
    (GEN / "endless").mkdir(exist_ok=True)

    # ---------------------------------------------------------------- packs
    site_topics = []
    deck_topics = defaultdict(list)
    total_facts = 0
    for p in packs:
        clues = [by_id[cid] for cid in p["clue_ids"] if cid in by_id]
        clues = [c for c in clues if c["usable"]]
        if len(clues) < 5:
            print(f"skip pack {p['id']}: only {len(clues)} usable clues")
            continue
        total_facts += len(p["facts"])
        site_topics.append({
            "id": p["id"],
            "name": p["name"],
            "deck": p["deck"],
            "hook": p["hook"],
            "aliases": p.get("aliases", []),
            "factCount": len(p["facts"]),
            "clueCount": len(clues),
            "first": index.get(p["id"], {}).get("first"),
            "last": index.get(p["id"], {}).get("last"),
            "related": p.get("related", []),
            "facts": [
                {"id": f["id"], "label": f["label"], "statement": f["statement"],
                 "associations": f["associations"],
                 "clues": [clue_obj(by_id[cid], response_freq)
                           for cid in f["clue_ids"] if cid in by_id and by_id[cid]["usable"]]}
                for f in p["facts"]
            ],
            "clues": [clue_obj(c, response_freq) for c in clues],
        })
        deck_topics[p["deck"]].append(p["id"])

    decks = []
    for did, meta in DECK_BY_ID.items():
        tids = deck_topics.get(did, [])
        if not tids:
            continue
        decks.append({
            "id": did, "title": meta["title"], "blurb": meta["blurb"],
            "topics": tids, "topicCount": len(tids),
            "clueCount": sum(len(t["clues"]) for t in site_topics if t["deck"] == did),
        })
    decks.sort(key=lambda d: -d["topicCount"])

    stats = {
        "cluesMined": len(corpus),
        "topics": len(site_topics),
        "facts": total_facts,
        "decks": len(decks),
        "firstDate": min(c["date"] for c in corpus),
        "lastDate": max(c["date"] for c in corpus),
    }
    site = {"drafts": [], "stats": stats, "decks": decks, "topics": site_topics}
    (GEN / "site.json").write_text(json.dumps(site, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ---------------------------------------------------------------- daily puzzles
    # Rotation: interleave decks, then topics by clue count so marquee topics recur.
    ordered = []
    buckets = {d["id"]: list(d["topics"]) for d in decks}
    for did in buckets:
        buckets[did].sort(key=lambda tid: -len(pack_by_id[tid]["clue_ids"]))
    i = 0
    while any(buckets.values()):
        for did in list(buckets):
            if buckets[did]:
                ordered.append(buckets[did].pop(0))
        i += 1
        if i > 10000:
            break

    puzzles = []
    prev = None
    for day in range(DAYS):
        # deterministic shuffle of the topic order per cycle
        tid = ordered[day % len(ordered)]
        pack = pack_by_id[tid]
        pool = [by_id[cid] for cid in pack["clue_ids"] if cid in by_id and by_id[cid]["usable"]]
        pool = [c for c in pool if not BAD_CLUE_RX.search(c["clue"])]
        # group by difficulty, pick a spread, prefer different answers
        tiers = defaultdict(list)
        for c in pool:
            tiers[difficulty(c, response_freq)].append(c)
        chosen, used_answers = [], set()
        # two easy, two medium, one hard, one wildcard; the rotation keeps
        # different clues surfacing on different days
        for tier in (1, 1, 2, 2, 3, 4, 2, 3):
            candidates = [c for c in tiers[tier] if c["answer_key"] not in used_answers]
            if not candidates:
                candidates = [c for c in pool if c["answer_key"] not in used_answers]
            if not candidates:
                break
            candidates.sort(key=lambda c: (abs(len(c["clue"]) - 115), c["id"]))
            c = candidates[(day * 3 + tier) % min(6, len(candidates))]
            chosen.append(c)
            used_answers.add(c["answer_key"])
            if len(chosen) == 6:
                break
        if len(chosen) < 6:
            for c in pool:
                if c["id"] not in {x["id"] for x in chosen} and c["answer_key"] not in used_answers:
                    chosen.append(c)
                    used_answers.add(c["answer_key"])
                if len(chosen) == 6:
                    break
        # final from another deck
        other = [t for t in ordered if pack_by_id[t]["deck"] != pack["deck"]] or ordered
        final_pack = pack_by_id[other[(day * 7 + 3) % len(other)]]
        finals = [by_id[cid] for cid in final_pack["clue_ids"]
                  if cid in by_id and by_id[cid]["usable"] and by_id[cid]["answer_key"] not in used_answers]
        if not finals:
            finals = [by_id[cid] for cid in final_pack["clue_ids"] if cid in by_id and by_id[cid]["usable"]]
        finals.sort(key=lambda c: (abs(len(c["clue"]) - 140), c["id"]))
        final = finals[(day * 5 + 1) % len(finals)] if finals else chosen[-1]
        puzzles.append({
            "d": (EPOCH + timedelta(days=day)).isoformat(),
            "t": tid,
            "tn": pack["name"],
            "th": pack["hook"],
            "clues": [clue_obj(c, response_freq) for c in chosen],
            "final": clue_obj(final, response_freq),
            "ft": final_pack["id"],
        })
    (GEN / "daily").mkdir(exist_ok=True)
    by_year = defaultdict(list)
    for pz in puzzles:
        by_year[pz["d"][:4]].append(pz)
    for year, rows in sorted(by_year.items()):
        (GEN / "daily" / f"{year}.json").write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (GEN / "daily" / "index.json").write_text(json.dumps({
        "years": sorted(by_year), "first": puzzles[0]["d"], "last": puzzles[-1]["d"],
        "count": len(puzzles),
    }), encoding="utf-8")

    # ---------------------------------------------------------------- lookup shards
    # Every usable clue, sharded by the first two characters of its answer. The
    # client fetches one small shard per lookup instead of a multi-megabyte index.
    lookup = defaultdict(list)
    for c in corpus:
        if not c["usable"] or len(c["clue"]) > 320 or len(c["response"]) > 80:
            continue
        k = key(c["response"])
        token = (k.split(" ") or [""])[0]
        shard = re.sub(r"[^a-z0-9]", "", token)[:2] or "0"
        lookup[shard].append([c["clue"], c["response"], c["date"], c["category"].title()])
    (GEN / "lookup").mkdir(exist_ok=True)
    lookup_count = 0
    for shard, recs in lookup.items():
        recs.sort(key=lambda r: r[2], reverse=True)
        lookup_count += len(recs)
        (GEN / "lookup" / f"{shard}.json").write_text(
            json.dumps(recs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (GEN / "lookup" / "index.json").write_text(json.dumps({
        "total": lookup_count,
        "shards": {shard: len(recs) for shard, recs in lookup.items()},
    }, separators=(",", ":")), encoding="utf-8")

    # ---------------------------------------------------------------- endless pool
    curated_ids = {cid for p in packs for cid in p["clue_ids"]}
    topic_of_clue = {}
    for t in site_topics:
        for c in t["clues"]:
            topic_of_clue.setdefault(c["id"], t["id"])

    def eligible(c):
        if not c["usable"] or c["id"] in curated_ids:
            return False
        if len(c["clue"]) < 38 or len(c["clue"]) > 260:
            return False
        if BAD_CATEGORY_RX.search(c["category"]) or BAD_CLUE_RX.search(c["clue"]):
            return False
        if len(re.findall(r"[A-Za-z]{2,}", c["response"])) > 9:
            return False
        return True

    pool = [c for c in corpus if eligible(c)]
    # score for human-friendliness: self-contained, interesting, answerable
    def quality(c):
        L = len(c["clue"])
        s = 0.0
        s += 1.0 if 60 <= L <= 190 else -0.6
        s += 0.5 if c["round"] == 3 else 0
        s += min(0.6, len(re.findall(r"\b[A-Z][a-z]+", c["clue"])) * 0.12)
        s += min(0.5, response_freq.get(c["answer_key"], 0) / 150)
        s -= 0.8 if re.search(r"\((?:Alex|Ken|Mayim|Jimmy|Sarah|Kelly|Robin|Pat|Vanna)[^)]{0,60}\)", c["clue"]) else 0
        s -= 1.0 if re.match(r"^(this|these|it|he|she|they)\b", c["clue"], re.I) and L < 70 else 0
        s += 0.3 if c["daily_double"] else 0
        return s

    pool.sort(key=quality, reverse=True)
    per_deck = Counter()
    endless = defaultdict(list)
    seen = set()
    # keep a spread over time and difficulty
    for c in pool:
        sig = (c["answer_key"], " ".join(clean(c["clue"]).lower().split()[:10]))
        if sig in seen:
            continue
        seen.add(sig)
        deck = c["deck"]
        if per_deck[deck] >= 2600:
            continue
        per_deck[deck] += 1
        obj = clue_obj(c, response_freq, deck)
        obj["t"] = topic_of_clue.get(c["id"])
        endless[deck].append(obj)
    for deck, rows in endless.items():
        (GEN / "endless" / f"{deck}.json").write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sizes = {p.name: round(p.stat().st_size / 1024) for p in GEN.glob("**/*.json")}
    print(json.dumps({"stats": stats, "puzzles": len(puzzles),
                      "endless": dict(per_deck), "lookup": lookup_count,
                      "sizesKB": sizes}, indent=1))
    total_kb = sum(sizes.values())
    print(f"generated data: {total_kb/1024:.1f} MB")


if __name__ == "__main__":
    main()
