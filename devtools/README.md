# DevTools

A static, dependency-free page of everyday developer utilities — an original implementation
covering the kind of features found on general-purpose online dev-tool sites (this does not
reuse any code, text, or design from any specific site).

**Tools included:** JSON formatter/minifier, Base64 encode/decode, URL encode/decode, JWT
decoder, hash generator (MD5, SHA-1/256/384/512), UUID generator, timestamp converter, cron
expression explainer, regex tester, text diff, color converter (HEX/RGB/HSL), case converter
(camelCase/snake_case/kebab-case/...), Lorem ipsum generator, HTML entity encode/decode,
Markdown preview, and QR code generator.

Everything runs client-side in plain JavaScript — no build step, no framework, no npm
dependencies. The one exception is the QR code tool, which calls a public image API
(`api.qrserver.com`) from the browser and so needs an internet connection; every other tool
works fully offline once the page is loaded.

## Run it

Open `index.html` directly in a browser, or serve the folder with any static file server, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Run the tests

The logic behind every tool (everything except DOM wiring) lives in `lib.mjs` and is unit
tested with Node's built-in test runner — no dependencies needed:

```bash
npm test
# or directly:
node --test tests/lib.test.mjs
```

## Layout

```
index.html      page shell: a sidebar of tools + one content area
style.css       styling (light/dark via prefers-color-scheme)
lib.mjs         pure logic for every tool — imported by main.js AND by the tests
main.js         DOM wiring: one entry per tool in the TOOLS array, rendering into #tool-body
tests/
  lib.test.mjs  node --test, covers every function in lib.mjs
```

## Add a tool

Add a pure function to `lib.mjs` (and a test for it), then add an entry to the `TOOLS` array
in `main.js` with an `id`, `label`, `desc`, and a `render(body)` function that builds the
inputs/outputs and calls your `lib.mjs` function. No other wiring is needed — it appears in
the sidebar automatically.
