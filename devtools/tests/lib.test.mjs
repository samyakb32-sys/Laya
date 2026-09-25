import assert from "node:assert/strict";
import { test } from "node:test";
import * as lib from "../lib.mjs";

test("formatJson / minifyJson", () => {
  const ok = lib.formatJson('{"b":1,"a":2}', 2);
  assert.equal(ok.ok, true);
  assert.equal(ok.output, '{\n  "b": 1,\n  "a": 2\n}');
  assert.equal(lib.minifyJson('{"a": 1}').output, '{"a":1}');
  const bad = lib.formatJson("{not json");
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
});

test("base64 round-trips ASCII and unicode", () => {
  for (const s of ["", "a", "hello world", "café \u{1F600}"]) {
    assert.equal(lib.base64Decode(lib.base64Encode(s)), s);
  }
  assert.equal(lib.base64Encode("Man"), "TWFu");
  assert.throws(() => lib.base64Decode("not!base64"));
});

test("url encode/decode", () => {
  assert.equal(lib.urlEncode("a b/c?d"), "a%20b%2Fc%3Fd");
  assert.equal(lib.urlDecode("a%20b"), "a b");
});

test("decodeJwt reads header and payload without verifying", () => {
  const header = lib.base64Encode('{"alg":"HS256","typ":"JWT"}').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payload = lib.base64Encode('{"sub":"123","name":"Ada"}').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = `${header}.${payload}.sig`;
  const d = lib.decodeJwt(token);
  assert.deepEqual(d.header, { alg: "HS256", typ: "JWT" });
  assert.deepEqual(d.payload, { sub: "123", name: "Ada" });
  assert.equal(d.signaturePresent, true);
  assert.throws(() => lib.decodeJwt("onlyonepart"));
});

test("md5 matches known test vectors", () => {
  assert.equal(lib.md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(lib.md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(lib.md5("The quick brown fox jumps over the lazy dog"), "9e107d9d372bb6826bd81d3542a419d6");
});

test("sha matches known test vectors", async () => {
  assert.equal(await lib.sha("abc", "SHA-256"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await lib.sha("abc", "SHA-1"), "a9993e364706816aba3e25717850c26c9cd0d89d");
});

test("generateUuid produces a v4-shaped id", () => {
  const id = lib.generateUuid();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(lib.generateUuid(), lib.generateUuid());
});

test("epochToDate / dateToEpoch", () => {
  assert.equal(lib.epochToDate(0, "ms").iso, "1970-01-01T00:00:00.000Z");
  assert.equal(lib.epochToDate(1, "s").iso, "1970-01-01T00:00:01.000Z");
  assert.equal(lib.dateToEpoch("1970-01-01T00:00:00.000Z").ms, 0);
  assert.throws(() => lib.epochToDate(NaN));
  assert.throws(() => lib.dateToEpoch("not a date"));
});

test("explainCron covers common patterns and a fallback", () => {
  assert.equal(lib.explainCron("* * * * *"), "Runs every minute.");
  assert.equal(lib.explainCron("*/15 * * * *"), "Runs every 15 minutes.");
  assert.equal(lib.explainCron("30 * * * *"), "Runs every hour, at minute 30.");
  assert.equal(lib.explainCron("0 9 * * *"), "Runs every day at 09:00.");
  assert.equal(lib.explainCron("0 9 * * 1"), "Runs every week on Monday at 09:00.");
  assert.match(lib.explainCron("5 4 1 * *"), /day-of-month 1/);
  assert.throws(() => lib.explainCron("* * *"));
});

test("testRegex finds all matches with groups", () => {
  const matches = lib.testRegex("(\\w+)@(\\w+)", "", "a@b c@d");
  assert.equal(matches.length, 2);
  assert.equal(matches[0].match, "a@b");
  assert.deepEqual(matches[0].captures, ["a", "b"]);
  assert.equal(matches[1].index, 4);
});

test("diffLines finds same/add/remove lines", () => {
  const d = lib.diffLines("a\nb\nc", "a\nx\nc");
  assert.deepEqual(d.map((r) => r.type), ["same", "remove", "add", "same"]);
});

test("color conversions round-trip", () => {
  assert.deepEqual(lib.hexToRgb("#ff0000"), { r: 255, g: 0, b: 0 });
  assert.equal(lib.rgbToHex({ r: 255, g: 0, b: 0 }), "#ff0000");
  assert.equal(lib.rgbToHex(lib.hexToRgb("#abc")), "#aabbcc");
  const hsl = lib.rgbToHsl({ r: 255, g: 0, b: 0 });
  assert.deepEqual(hsl, { h: 0, s: 100, l: 50 });
  assert.deepEqual(lib.hslToRgb(hsl), { r: 255, g: 0, b: 0 });
  assert.throws(() => lib.hexToRgb("nope"));
});

test("case conversions", () => {
  const input = "Hello World_example-Case";
  assert.equal(lib.toCamelCase(input), "helloWorldExampleCase");
  assert.equal(lib.toPascalCase(input), "HelloWorldExampleCase");
  assert.equal(lib.toSnakeCase(input), "hello_world_example_case");
  assert.equal(lib.toKebabCase(input), "hello-world-example-case");
  assert.equal(lib.toTitleCase(input), "Hello World Example Case");
  assert.equal(lib.toConstantCase(input), "HELLO_WORLD_EXAMPLE_CASE");
});

test("generateLorem is deterministic for a given seed and always opens the same way", () => {
  const a = lib.generateLorem(2, 3, 42);
  const b = lib.generateLorem(2, 3, 42);
  assert.equal(a, b);
  assert.ok(a.startsWith("Lorem ipsum dolor sit amet, consectetur adipiscing elit."));
  assert.equal(a.split("\n\n").length, 2);
});

test("HTML entity encode/decode", () => {
  assert.equal(lib.encodeHtmlEntities(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(lib.decodeHtmlEntities("&lt;b&gt; &amp; &#65; &#x42;"), "<b> & A B");
});

test("renderMarkdown handles headings, inline styles, lists and code fences", () => {
  const html = lib.renderMarkdown("# Title\n\nSome **bold** and *italic* and `code`.\n\n- one\n- two\n\n```\nraw <b>\n```");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<pre><code>raw &lt;b&gt;\n<\/code><\/pre>/);
});

test("qrImageUrl encodes the payload", () => {
  assert.equal(lib.qrImageUrl("a b", 150), "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=a%20b");
});
