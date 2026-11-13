"""Validate curated topic packs against the corpus and the site schema."""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOPICS = ROOT / "data" / "topics"
WORK = ROOT / "data" / "work"
DECKS = {
    "literature", "history", "geography", "science", "arts", "film-tv", "music",
    "sports", "myth-religion", "food-drink", "words-language", "business",
    "pop-culture", "world-culture", "potpourri",
}
FACT_KEYS = {"id", "label", "statement", "associations", "clue_ids"}
PACK_KEYS = {"id", "name", "deck", "aliases", "hook", "facts", "clue_ids", "related"}


def main():
    corpus = {c["id"]: c for c in (json.loads(l) for l in open(WORK / "clues.jsonl", encoding="utf-8"))}
    index = {t["id"]: t for t in json.load(open(TOPICS / "index.json"))}
    packs = {}
    errors, warnings = [], []
    for p in sorted(TOPICS.glob("*.json")):
        if p.name == "index.json":
            continue
        try:
            pack = json.load(open(p, encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{p.name}: invalid JSON: {e}")
            continue
        if pack.get("skip"):
            continue
        pid = pack.get("id", "")
        if pid != p.stem:
            errors.append(f"{p.name}: id {pid!r} does not match filename")
        if pid not in index:
            errors.append(f"{p.name}: id not in index.json")
        if pack.get("deck") not in DECKS:
            errors.append(f"{p.name}: bad deck {pack.get('deck')!r}")
        if set(pack) - PACK_KEYS:
            warnings.append(f"{p.name}: extra pack keys {set(pack) - PACK_KEYS}")
        missing = {"id", "name", "deck", "hook", "facts", "clue_ids"} - set(pack)
        if missing:
            errors.append(f"{p.name}: missing keys {missing}")
            continue
        facts = pack["facts"]
        if not (3 <= len(facts) <= 8):
            errors.append(f"{p.name}: {len(facts)} facts (want 3-8)")
        labels = Counter(f.get("label") for f in facts)
        for f in facts:
            fkeys = set(f)
            if fkeys - FACT_KEYS:
                warnings.append(f"{p.name}/{f.get('id')}: extra fact keys {fkeys - FACT_KEYS}")
            if not f.get("id") or not re.fullmatch(r"[a-z0-9-]+", str(f.get("id"))):
                errors.append(f"{p.name}/{f.get('id')}: invalid fact id")
            st = f.get("statement") or ""
            if not (25 <= len(st) <= 300):
                errors.append(f"{p.name}/{f.get('id')}: statement length {len(st)}")
            if len(f.get("associations") or []) < 2:
                warnings.append(f"{p.name}/{f.get('id')}: fewer than 2 associations")
            fids = f.get("clue_ids") or []
            if not fids:
                errors.append(f"{p.name}/{f.get('id')}: no clue_ids")
            for cid in fids:
                if cid not in corpus:
                    errors.append(f"{p.name}/{f.get('id')}: unknown clue id {cid}")
                elif cid not in pack["clue_ids"]:
                    pack["clue_ids"].append(cid)
        if len(set(pack["clue_ids"])) != len(pack["clue_ids"]):
            errors.append(f"{p.name}: duplicate clue_ids")
        if not (5 <= len(pack["clue_ids"]) <= 24):
            warnings.append(f"{p.name}: {len(pack['clue_ids'])} clues (want 8-18)")
        for cid in pack["clue_ids"]:
            c = corpus.get(cid)
            if not c:
                errors.append(f"{p.name}: unknown clue id {cid}")
                continue
            if not c["usable"]:
                warnings.append(f"{p.name}: clue {cid} not marked usable")
        for rid in pack.get("related") or []:
            if rid not in index:
                warnings.append(f"{p.name}: unknown related id {rid}")
        for label, n in labels.items():
            if n > 1:
                errors.append(f"{p.name}: duplicate fact label {label!r}")
        packs[pid] = pack

    print(f"packs: {len(packs)}")
    print(f"facts: {sum(len(p['facts']) for p in packs.values())}")
    print(f"clues: {sum(len(p['clue_ids']) for p in packs.values())}")
    for e in errors:
        print("ERROR", e)
    for w in warnings[:40]:
        print("warn ", w)
    if len(warnings) > 40:
        print(f"... {len(warnings) - 40} more warnings")
    print(f"{len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
