# Data

Three layers, deliberately separated.

## 1. Corpus — `corpus/clues.jsonl.gz`

Every normalized, text-only clue from the archive, 1984–2026. One JSON object per line:

```json
{"id":"f7a41c0fb4","clue":"...","response":"Gone with the Wind","answer_key":"gone with the wind",
 "category":"AMERICAN LITERATURE","round":1,"value":400,"daily_double":false,
 "date":"2012-03-14","source":"syndicated","deck":"literature","usable":true}
```

- `clue` is the prompt read by the host; `response` is the correct answer.
- `id` is a stable hash of date/round/category/clue, used for provenance in topic packs.
- `usable` marks text-only, self-contained clues suitable for a typing quiz.
- `deck` is a broad browsing bucket, not a score.

Built by `pipeline/build_corpus.py` from the releases of
[jwolle1/jeopardy_clue_dataset](https://github.com/jwolle1/jeopardy_clue_dataset),
which is derived from the fan-run [J! Archive](https://j-archive.com/).

## 2. Evidence — `work/` (generated, not committed)

- `dossiers/<topic>.json` — frequency, first/last date, top terms, answer associations,
  category spread, representative clues.
- `shortlists/<topic>.json` — a self-contained authoring brief: dossier summary plus 26
  quality-filtered real clues with ids, difficulties and provenance.
- `seeds.json` — the curated seed topics and aliases.

Rebuild with:

```bash
gzip -dc data/corpus/clues.jsonl.gz > data/work/clues.jsonl
python3 pipeline/mine.py
python3 pipeline/shortlist.py
```

## 3. Knowledge — `topics/` (committed)

One JSON file per topic. The schema is documented in `CURATION.md`. Every fact cites
one to three real clue ids, and every pack's `clue_ids` are drawn from the archive. This
is the only hand-authored layer.

`pipeline/validate_packs.py` enforces the schema, checks clue ids exist and are usable,
and rejects duplicate fact labels.

## Generated for the site — `generated/` (not committed)

- `site.json` — decks, topic summaries, facts and clue payloads
- `daily/<year>.json` — deterministic daily puzzles
- `endless/<deck>.json` — per-deck clue pools
- `lookup/<xx>.json` — all clues sharded by the first two letters of the answer
- `learn.json` — every fact with one cited clue, for the Learn flashcards and recall quiz

Regenerate with `python3 pipeline/site_data.py`.

## Licensing

The clue text is the property of Jeopardy Productions, Inc. This repository is an
unaffiliated, non-commercial fan project. The code and the curated facts are MIT-licensed;
the clues are not.
