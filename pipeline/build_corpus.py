"""Normalize the raw J! Archive-derived TSV corpus into a stable JSONL file."""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import clean, key, clue_id, deck_for, is_usable  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "jeopardy_dataset_seasons_1-42"
OUT = ROOT / "data" / "work"
OUT.mkdir(parents=True, exist_ok=True)

ROUNDS = {"1": 1, "2": 2, "3": 3}


def rows(path: Path):
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            yield r


def main():
    out = []
    seen = set()
    source_files = [
        (RAW / "combined_season1-42.tsv", "syndicated"),
        (RAW / "extra_matches.tsv", "extra"),
    ]
    for path, source in source_files:
        for r in rows(path):
            clue = clean(r.get("answer", ""))
            response = clean(r.get("question", ""))
            if not clue or not response:
                continue
            category = clean(r.get("category", ""))
            rnd = ROUNDS.get(str(r.get("round", "")).strip(), 0)
            if rnd == 0:
                continue
            date = clean(r.get("air_date", ""))[:10]
            cid = clue_id(date, str(rnd), category, clue)
            if cid in seen:
                continue
            seen.add(cid)
            try:
                value = int(str(r.get("clue_value", "0")).replace(",", "") or 0)
            except ValueError:
                value = 0
            try:
                dd = int(str(r.get("daily_double_value", "0")).replace(",", "") or 0)
            except ValueError:
                dd = 0
            out.append({
                "id": cid,
                "clue": clue,
                "response": response,
                "answer_key": key(response),
                "category": category,
                "round": rnd,
                "value": value,
                "daily_double": dd > 0,
                "date": date,
                "source": source,
                "deck": deck_for(category),
                "usable": is_usable(clue, response, category),
            })

    out.sort(key=lambda c: (c["date"], c["round"], c["category"], c["id"]))
    dst = OUT / "clues.jsonl"
    with open(dst, "w", encoding="utf-8") as f:
        for c in out:
            f.write(json.dumps(c, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {len(out):,} clues to {dst}")

    # quick health report
    from collections import Counter
    usable = [c for c in out if c["usable"]]
    print(f"usable {len(usable):,} ({len(usable)/len(out):.1%})")
    print("rounds", Counter(c["round"] for c in out))
    print("decks", Counter(c["deck"] for c in out).most_common())
    print("dates", min(c["date"] for c in out), max(c["date"] for c in out))
    print("distinct responses", len({c["answer_key"] for c in out}))
    dup = Counter((c["clue"], c["response"]) for c in out)
    print("exact repeated clue/response pairs", sum(1 for n in dup.values() if n > 1))


if __name__ == "__main__":
    main()
