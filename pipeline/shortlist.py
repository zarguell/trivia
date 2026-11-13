"""Build self-contained authoring briefs for each curated topic.

Each brief contains the mined evidence (associations, distinctive terms, representative
clues) plus a shortlist of well-formed real clues. Curators turn the evidence into the
handful of associations worth learning, and pick the clues used to test them.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import clean, key  # noqa: E402
from mine import Corpus, Matcher, tokens, settle, slugify, dedupe_examples  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "data" / "work"
TOPICS = ROOT / "data" / "topics"
SHORTLISTS = WORK / "shortlists"

BAD_CATEGORY_RX = re.compile(
    r"\b(WORDPLAY|WORD PLAY|BEFORE & AFTER|RHYME|ANAGRAM|PALINDROME|CROSSWORD|"
    r"LETTERS|SPELLING|BLANK|FILL IN|PUNCTUATION|QUOTATION|QUOTE|"
    r"PHOTO|PICTURE|IMAGE|VIDEO|AUDIO|SCREEN|VISUAL)\b", re.I)
BAD_CLUE_RX = re.compile(
    r"(which of these|all of the following|none of the above|"
    r"^name (any|one|two|three)|^how many|^in what year did .* born)", re.I)
VAGUE_RX = re.compile(r"^(this|these|it|he|she|they)\b", re.I)


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


def score_clue(c, answer_is_topic, assoc_rank, response_freq):
    s = 0.0
    if answer_is_topic:
        s += 2.4
    s += max(0.0, 1.2 - assoc_rank * 0.08)
    L = len(c["clue"])
    if 55 <= L <= 200:
        s += 0.8
    elif L < 40:
        s -= 0.9
    if c["round"] == 3:
        s += 0.5
    if c["value"] >= 800:
        s += 0.25
    if BAD_CATEGORY_RX.search(c["category"]):
        s -= 2.0
    if BAD_CLUE_RX.search(c["clue"]):
        s -= 1.2
    # A clue that starts "This ..." still works when the clue body is rich.
    if VAGUE_RX.search(c["clue"]) and L < 60:
        s -= 0.5
    if len(re.findall(r"\b[A-Z][a-z]+", c["clue"])) >= 3:
        s += 0.3
    s += min(0.4, response_freq.get(c["answer_key"], 0) / 200)
    return round(s, 2)


def main():
    corpus = Corpus(WORK / "clues.jsonl")
    index = json.load(open(TOPICS / "index.json"))
    response_freq = Counter(c["answer_key"] for c in corpus.clues)
    matcher = Matcher([{**t, "slug": t["id"]} for t in index])
    mentions = defaultdict(set)
    for i, c in enumerate(corpus.clues):
        for slug in matcher.match(c["clue"]):
            mentions[slug].add(i)

    SHORTLISTS.mkdir(parents=True, exist_ok=True)
    for t in index:
        slug = t["id"]
        dossier_path = WORK / "dossiers" / f"{slug}.json"
        dossier = json.load(open(dossier_path)) if dossier_path.exists() else None
        answer_ids = set()
        for a in [t["name"]] + t.get("aliases", []):
            answer_ids.update(corpus.by_response.get(key(a), []))
        all_ids = answer_ids | mentions.get(slug, set())
        if not all_ids:
            print("no clues for", t["name"])
            continue
        assoc = Counter()
        for i in mentions.get(slug, set()):
            if i not in answer_ids:
                assoc[corpus.clues[i]["answer_key"]] += 1
        assoc_rank = {a: r for r, (a, _) in enumerate(assoc.most_common(30))}

        pool = []
        for i in all_ids:
            c = corpus.clues[i]
            if not c["usable"]:
                continue
            if len(c["clue"]) < 28 or len(c["clue"]) > 320:
                continue
            if not c["response"] or len(c["response"]) > 70:
                continue
            pool.append((score_clue(c, i in answer_ids, assoc_rank.get(c["answer_key"], 15), response_freq), c))

        # diverse shortlist: at most 2 per answer, dedupe near-identical openings
        pool.sort(key=lambda x: -x[0])
        out, seen_resp, seen_sig = [], Counter(), set()
        for s, c in pool:
            if seen_resp[c["answer_key"]] >= 2:
                continue
            sig = " ".join(clean(c["clue"]).lower().split()[:9])
            if sig in seen_sig:
                continue
            seen_resp[c["answer_key"]] += 1
            seen_sig.add(sig)
            out.append({
                "id": c["id"], "clue": c["clue"], "response": c["response"],
                "category": c["category"].title(), "round": c["round"],
                "date": c["date"], "value": c["value"],
                "difficulty": difficulty(c, response_freq),
                "tests_topic": c["id"] in {corpus.clues[i]["id"] for i in answer_ids},
                "score": s,
            })
            if len(out) >= 26:
                break

        brief = {
            "id": slug,
            "name": t["name"],
            "deck": t["deck"],
            "aliases": t.get("aliases", []),
            "clue_count": t["clueCount"],
            "as_answer": t["asAnswer"],
            "first": t["first"],
            "last": t["last"],
            "top_terms": (dossier or {}).get("terms", [])[:16],
            "top_associations": [
                {"answer": a["answer"], "n": a["n"],
                 "example": a["examples"][-1]["clue"] if a["examples"] else None}
                for a in (dossier or {}).get("associations", [])[:12]
            ],
            "categories": (dossier or {}).get("categories", [])[:8],
            "candidate_clues": out,
        }
        (SHORTLISTS / f"{slug}.json").write_text(
            json.dumps(brief, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(index)} briefs to {SHORTLISTS}")


if __name__ == "__main__":
    main()
