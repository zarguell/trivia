import test from "node:test";
import assert from "node:assert/strict";
import { normAnswer, isAnswer, optionsFor, shape, levenshtein, categoryRevealsAnswer } from "../site/client/core.js";

test("normalization strips question scaffolding and articles", () => {
  assert.equal(normAnswer("What is the Mona Lisa?"), "mona lisa");
  assert.equal(normAnswer("Who was Margaret Mitchell"), "margaret mitchell");
  assert.equal(normAnswer("  Café  Society "), "cafe society");
  assert.equal(normAnswer("The Beatles"), "beatles");
});

test("exact and near-exact answers pass", () => {
  assert.ok(isAnswer("Mona Lisa", "Mona Lisa"));
  assert.ok(isAnswer("mona lisa", "Mona Lisa"));
  assert.ok(isAnswer("pistacio", "pistachio"));
  assert.ok(isAnswer("Gone With The Wind", "Gone with the Wind"));
});

test("surnames and partial names pass, weak fragments do not", () => {
  assert.ok(isAnswer("Mitchell", "Margaret Mitchell"));
  assert.ok(isAnswer("van gogh", "Vincent van Gogh"));
  assert.ok(!isAnswer("gone", "Gone with the Wind"));
  assert.ok(!isAnswer("the", "The Godfather"));
});

test("wrong numbers and unrelated answers fail", () => {
  assert.ok(!isAnswer("1952", "1953"));
  assert.ok(!isAnswer("Picasso", "Michelangelo"));
  assert.ok(!isAnswer("", "Zeus"));
});

test("levenshtein sanity", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
});

test("shape distinguishes people, places, numbers", () => {
  assert.equal(shape("Margaret Mitchell"), "name");
  assert.equal(shape("(James) Buchanan"), "proper");
  assert.equal(shape("the Alamo"), "proper");
  assert.equal(shape("1912"), "num");
  assert.equal(shape("pistachio"), "common");
});

test("multiple choice always includes the answer, four unique options", () => {
  const pool = [
    { a: "Margaret Mitchell" }, { a: "Harper Lee" }, { a: "Mark Twain" },
    { a: "Ernest Hemingway" }, { a: "Atlanta" }, { a: "1936" },
  ];
  const clue = { a: "Margaret Mitchell" };
  for (let i = 0; i < 30; i++) {
    const opts = optionsFor(clue, pool);
    assert.equal(opts.length, 4);
    assert.equal(new Set(opts).size, 4);
    assert.ok(opts.includes("Margaret Mitchell"));
  }
});

test("categories that give away the answer are suppressed", () => {
  assert.ok(categoryRevealsAnswer("VINCENT VAN GOGH", "the Van Gogh Museum"));
  assert.ok(categoryRevealsAnswer("VAN GOGH", "Van Gogh Museum"));
  assert.ok(categoryRevealsAnswer("REBECCA", "Rebecca"));
  assert.ok(categoryRevealsAnswer("THE BEATLES", "The Beatles"));
  assert.ok(categoryRevealsAnswer("WILLIAM SHAKESPEARE", "Shakespeare"));
  assert.ok(categoryRevealsAnswer("NEW YORK", "New York City"));
  assert.ok(!categoryRevealsAnswer("VINCENT VAN GOGH", "Starry Night"));
  assert.ok(!categoryRevealsAnswer("U.S. PRESIDENTS", "Lincoln"));
  assert.ok(!categoryRevealsAnswer("THE BEATLES", "John Lennon"));
  assert.ok(!categoryRevealsAnswer("WORLD WAR II", "Winston Churchill"));
  assert.ok(!categoryRevealsAnswer("HITCHCOCK FILMS", "Rebecca"));
  assert.ok(!categoryRevealsAnswer("Putting The Pop In Pop Culture", "King of Pop"));
  assert.ok(!categoryRevealsAnswer("O Captain! My Captain!", "Captain Cook"));
  assert.ok(!categoryRevealsAnswer("Tom, Tom", "Tom Buchanan"));
});
