# Curation guide: turning mined clues into "the six things"

The site is built on one idea: Jeopardy keeps asking the same handful of things about a
topic. Your job is to write that handful down.

## Input

`data/work/shortlists/<id>.json` is a self-contained brief:

- `name`, `deck`, `aliases`, `clue_count`, `as_answer`, `first`, `last`
- `top_terms`: words that keep appearing when this topic is the answer
- `top_associations`: answers that keep appearing in clues that mention the topic
- `candidate_clues`: 26 real, already quality-filtered clues with ids, dates, categories,
  difficulty (1 easy – 4 hard), and `tests_topic` (the response is the topic itself)

Treat the brief as evidence. Do not invent specifics that the brief does not support.
Well-known facts (e.g. "Shakespeare wrote Hamlet") are fine. Obscure dates, stats and
names are not.

## Output

Write `data/topics/<id>.json`. Exact schema:

```json
{
  "id": "gone-with-the-wind",
  "name": "Gone with the Wind",
  "deck": "literature",
  "aliases": ["GWTW"],
  "hook": "The American novel Jeopardy asks about more than any other.",
  "facts": [
    {
      "id": "author",
      "label": "Margaret Mitchell",
      "statement": "Margaret Mitchell wrote it — her only novel, published in 1936, and winner of the 1937 Pulitzer Prize.",
      "associations": ["Margaret Mitchell", "1936", "Pulitzer Prize"],
      "clue_ids": ["2d5be294b3", "f8178d8f6b"]
    }
  ],
  "clue_ids": ["2d5be294b3", "f8178d8f6b", "..."],
  "related": ["the-wizard-of-oz"]
}
```

Rules:

- **4–7 facts.** Each is one thing worth knowing, not a summary of everything.
- `label` is the answer-shaped core: a name, place, year, title or phrase. Unique per pack.
- `statement` is 25–300 characters, present tense, concrete, and contains the association
  you want the player to retrieve. No questions, no markdown, no "This clue...".
- `associations` are 2–5 short retrieval cues (names, dates, titles, phrases). These become
  the chips on the study card.
- `clue_ids` on each fact: 1–3 ids copied verbatim from `candidate_clues` that actually
  demonstrate the fact. Never invent ids.
- Pack `clue_ids`: 10–18 ids from `candidate_clues`, all unique. Mix answers and
  difficulties. Exclude clues that are about a different sense of the word, require an
  image, or are wordplay.
- `hook`: one sentence, max 120 characters, why this topic is worth six minutes.
- `related`: 2–4 ids from `data/topics/index.json`, or omit.
- If the evidence is too thin for 3 defensible facts, write
  `{"id": "<id>", "skip": true, "reason": "..."}` instead.

## Style

Write for recall, not for a Wikipedia article. "Hattie McDaniel played Mammy and became
the first African-American performer to win an Oscar" beats "The film featured a cast
including...". Prefer the detail that has actually been asked. If the brief shows a phrase
appearing repeatedly ("tomorrow is another day", "fiddle-dee-dee"), that phrase *is* the
fact.

Do not pad. Four sharp facts beat seven vague ones.

## Check

`python3 pipeline/validate_packs.py` must pass with zero errors. Do not edit other files.
