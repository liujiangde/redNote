import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { normalizeWordFonts } from "./word-font-compat";

test("resolves the conflicting font declaration without changing other styles or content", () => {
  const xml = '<w:styles><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:ascii="Noto Sans CJK SC" w:hAnsi="Noto Sans CJK SC" w:eastAsia="Noto Sans CJK SC"/><w:rFonts w:asciiTheme="majorHAnsi" w:ascii="Other"/></w:styles>';
  const source = zipSync({ "word/styles.xml": strToU8(xml), "word/document.xml": strToU8("document content") });
  const output = unzipSync(normalizeWordFonts(source));
  const styles = strFromU8(output["word/styles.xml"]);
  assert.match(styles, /w:ascii="Noto Sans CJK SC"/);
  assert.doesNotMatch(styles, /w:eastAsiaTheme=/);
  assert.match(styles, /w:asciiTheme="majorHAnsi" w:ascii="Other"/);
  assert.equal(strFromU8(output["word/document.xml"]), "document content");
});

test("leaves unrelated documents unchanged and rejects invalid files", () => {
  const source = zipSync({ "word/styles.xml": strToU8('<w:rFonts w:ascii="Other"/>') });
  assert.equal(normalizeWordFonts(source), source);
  assert.throws(() => normalizeWordFonts(strToU8("not a document")));
});
