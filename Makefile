PY ?= python3
NODE ?= node

.PHONY: all corpus data build serve check test validate clean

all: data build

# The normalized corpus is committed as gzip so CI does not need the 57 MB raw release.
corpus:
	@mkdir -p data/work
	@test -f data/work/clues.jsonl || gzip -dc data/corpus/clues.jsonl.gz > data/work/clues.jsonl

data: corpus
	$(PY) pipeline/site_data.py

build:
	$(NODE) site/build.mjs

serve:
	$(NODE) scripts/serve.mjs

check: build
	$(NODE) scripts/check.mjs

test:
	$(NODE) --test tests/

validate: corpus
	$(PY) pipeline/validate_packs.py

clean:
	rm -rf dist data/work data/generated
