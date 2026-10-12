import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slugify.js";

test("lowercases and joins words with dashes", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("trims and collapses whitespace", () => {
  assert.equal(slugify("  Many   spaces here "), "many-spaces-here");
});

test("removes punctuation", () => {
  assert.equal(slugify("What's new? (2026 edition)!"), "whats-new-2026-edition");
});

test("collapses repeated dashes", () => {
  assert.equal(slugify("a - b -- c"), "a-b-c");
});

// SEO team (TICKET-481): slugs must be plain ASCII so they work in every email client.
test("transliterates accented letters to ASCII", () => {
  assert.equal(slugify("Café com Leite"), "cafe-com-leite");
  assert.equal(slugify("Ação Rápida"), "acao-rapida");
});

// i18n team (TICKET-502): keep native spelling in localized URLs.
test("preserves accented letters for localized URLs", () => {
  assert.equal(slugify("Crème Brûlée"), "crème-brûlée");
  assert.equal(slugify("Über Straße"), "über-straße");
});
