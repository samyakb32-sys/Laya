import * as lib from "./lib.mjs";

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  children.flat().forEach((c) => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return node;
};

function showResult(container, ok, output, errorPrefix = "Error") {
  container.innerHTML = "";
  if (ok) {
    container.append(el("pre", { class: "output" }, output));
  } else {
    container.append(el("pre", { class: "output error" }, `${errorPrefix}: ${output}`));
  }
}

// ---------- Tool definitions ----------
// Each tool renders its own inputs/outputs into `body`. Keep DOM wiring here;
// all the actual logic lives in lib.mjs (and is unit-tested there).

const TOOLS = [
  {
    id: "json",
    label: "JSON Formatter",
    desc: "Pretty-print, minify, and validate JSON.",
    render(body) {
      const input = el("textarea", { placeholder: '{"example": true}' });
      const out = el("div");
      body.append(
        el("label", {}, "JSON input"), input,
        el("div", {},
          el("button", { class: "btn", onclick: () => { const r = lib.formatJson(input.value); showResult(out, r.ok, r.ok ? r.output : r.error); } }, "Format"),
          el("button", { class: "btn secondary", onclick: () => { const r = lib.minifyJson(input.value); showResult(out, r.ok, r.ok ? r.output : r.error); } }, "Minify"),
        ),
        out,
      );
    },
  },
  {
    id: "base64",
    label: "Base64",
    desc: "Encode or decode Base64 (Unicode-safe).",
    render(body) {
      const input = el("textarea", { placeholder: "Text or Base64..." });
      const out = el("div");
      body.append(
        el("label", {}, "Input"), input,
        el("div", {},
          el("button", { class: "btn", onclick: () => { try { showResult(out, true, lib.base64Encode(input.value)); } catch (e) { showResult(out, false, e.message); } } }, "Encode"),
          el("button", { class: "btn secondary", onclick: () => { try { showResult(out, true, lib.base64Decode(input.value)); } catch (e) { showResult(out, false, e.message); } } }, "Decode"),
        ),
        out,
      );
    },
  },
  {
    id: "urlencode",
    label: "URL Encode",
    desc: "Percent-encode or decode a URL component.",
    render(body) {
      const input = el("textarea", { placeholder: "https://example.com/?q=a b" });
      const out = el("div");
      body.append(
        el("label", {}, "Input"), input,
        el("div", {},
          el("button", { class: "btn", onclick: () => { try { showResult(out, true, lib.urlEncode(input.value)); } catch (e) { showResult(out, false, e.message); } } }, "Encode"),
          el("button", { class: "btn secondary", onclick: () => { try { showResult(out, true, lib.urlDecode(input.value)); } catch (e) { showResult(out, false, e.message); } } }, "Decode"),
        ),
        out,
      );
    },
  },
  {
    id: "jwt",
    label: "JWT Decoder",
    desc: "Decode a JWT's header and payload. Does not verify the signature.",
    render(body) {
      const input = el("textarea", { placeholder: "eyJhbGciOi...header.payload.signature" });
      const out = el("div");
      body.append(
        el("label", {}, "Token"), input,
        el("button", { class: "btn", onclick: () => {
          try {
            const d = lib.decodeJwt(input.value.trim());
            showResult(out, true, `Header:\n${JSON.stringify(d.header, null, 2)}\n\nPayload:\n${JSON.stringify(d.payload, null, 2)}\n\nSignature present: ${d.signaturePresent}`);
          } catch (e) { showResult(out, false, e.message); }
        } }, "Decode"),
        out,
      );
    },
  },
  {
    id: "hash",
    label: "Hash Generator",
    desc: "MD5, SHA-1, SHA-256, SHA-384, SHA-512.",
    render(body) {
      const input = el("textarea", { placeholder: "Text to hash..." });
      const out = el("div");
      const run = async () => {
        const [md5, sha1, sha256, sha384, sha512] = await Promise.all([
          Promise.resolve(lib.md5(input.value)),
          lib.sha(input.value, "SHA-1"), lib.sha(input.value, "SHA-256"),
          lib.sha(input.value, "SHA-384"), lib.sha(input.value, "SHA-512"),
        ]);
        showResult(out, true, `MD5:     ${md5}\nSHA-1:   ${sha1}\nSHA-256: ${sha256}\nSHA-384: ${sha384}\nSHA-512: ${sha512}`);
      };
      body.append(el("label", {}, "Input"), input, el("button", { class: "btn", onclick: run }, "Generate"), out);
    },
  },
  {
    id: "uuid",
    label: "UUID Generator",
    desc: "Generate random v4 UUIDs.",
    render(body) {
      const count = el("input", { type: "number", value: "5", min: "1", max: "100" });
      const out = el("div");
      body.append(
        el("label", {}, "How many"), count,
        el("button", { class: "btn", onclick: () => {
          const n = Math.max(1, Math.min(100, Number(count.value) || 1));
          showResult(out, true, Array.from({ length: n }, () => lib.generateUuid()).join("\n"));
        } }, "Generate"),
        out,
      );
    },
  },
  {
    id: "timestamp",
    label: "Timestamp Converter",
    desc: "Convert between Unix epoch and human-readable dates.",
    render(body) {
      const epoch = el("input", { type: "text", placeholder: "1700000000" });
      const unit = el("select", {}, el("option", { value: "s" }, "seconds"), el("option", { value: "ms" }, "milliseconds"));
      const dateStr = el("input", { type: "text", placeholder: "2024-01-01T00:00:00Z" });
      const out = el("div");
      body.append(
        el("div", { class: "row" },
          el("div", {}, el("label", {}, "Epoch"), epoch),
          el("div", {}, el("label", {}, "Unit"), unit),
        ),
        el("button", { class: "btn", onclick: () => {
          try {
            const d = lib.epochToDate(Number(epoch.value), unit.value);
            showResult(out, true, `ISO:   ${d.iso}\nUTC:   ${d.utc}\nLocal: ${d.local}`);
          } catch (e) { showResult(out, false, e.message); }
        } }, "Epoch → Date"),
        el("button", { class: "btn secondary", onclick: () => { epoch.value = String(Date.now()); unit.value = "ms"; } }, "Now"),
        el("label", {}, "Date string (any format Date.parse understands)"), dateStr,
        el("button", { class: "btn", onclick: () => {
          try {
            const r = lib.dateToEpoch(dateStr.value);
            showResult(out, true, `Milliseconds: ${r.ms}\nSeconds:      ${r.s}`);
          } catch (e) { showResult(out, false, e.message); }
        } }, "Date → Epoch"),
        out,
      );
    },
  },
  {
    id: "cron",
    label: "Cron Explainer",
    desc: "Explain a standard 5-field cron expression in plain English.",
    render(body) {
      const input = el("input", { type: "text", placeholder: "*/15 * * * *" });
      const out = el("div");
      body.append(
        el("label", {}, "Cron expression"), input,
        el("button", { class: "btn", onclick: () => {
          try { showResult(out, true, lib.explainCron(input.value)); } catch (e) { showResult(out, false, e.message); }
        } }, "Explain"),
        out,
      );
    },
  },
  {
    id: "regex",
    label: "Regex Tester",
    desc: "Test a regular expression against sample text.",
    render(body) {
      const pattern = el("input", { type: "text", placeholder: "\\w+@\\w+" });
      const flags = el("input", { type: "text", placeholder: "gi", value: "g" });
      const text = el("textarea", { placeholder: "Text to search..." });
      const out = el("div");
      body.append(
        el("div", { class: "row" },
          el("div", {}, el("label", {}, "Pattern"), pattern),
          el("div", {}, el("label", {}, "Flags"), flags),
        ),
        el("label", {}, "Text"), text,
        el("button", { class: "btn", onclick: () => {
          try {
            const matches = lib.testRegex(pattern.value, flags.value, text.value);
            if (!matches.length) { showResult(out, true, "No matches."); return; }
            const table = el("table", { class: "match-table" },
              el("tr", {}, el("th", {}, "#"), el("th", {}, "Match"), el("th", {}, "Index"), el("th", {}, "Groups")),
              ...matches.map((m, i) => el("tr", {},
                el("td", {}, String(i + 1)), el("td", {}, m.match), el("td", {}, String(m.index)),
                el("td", {}, JSON.stringify(m.groups ?? m.captures)),
              )),
            );
            out.innerHTML = "";
            out.append(table);
          } catch (e) { showResult(out, false, e.message); }
        } }, "Test"),
        out,
      );
    },
  },
  {
    id: "diff",
    label: "Text Diff",
    desc: "Compare two texts line by line.",
    render(body) {
      const a = el("textarea", { placeholder: "Original text..." });
      const b = el("textarea", { placeholder: "Changed text..." });
      const out = el("div");
      body.append(
        el("div", { class: "row" },
          el("div", {}, el("label", {}, "Original"), a),
          el("div", {}, el("label", {}, "Changed"), b),
        ),
        el("button", { class: "btn", onclick: () => {
          if (a.value.split("\n").length * b.value.split("\n").length > 4_000_000) {
            showResult(out, false, "Inputs too large for this simple diff — try smaller text.");
            return;
          }
          const rows = lib.diffLines(a.value, b.value);
          out.innerHTML = "";
          out.append(...rows.map((r) => el("div", { class: `diff-line ${r.type}` }, `${r.type === "add" ? "+ " : r.type === "remove" ? "- " : "  "}${r.text}`)));
        } }, "Compare"),
        out,
      );
    },
  },
  {
    id: "color",
    label: "Color Converter",
    desc: "Convert between HEX, RGB, and HSL.",
    render(body) {
      const hex = el("input", { type: "text", placeholder: "#5b8cff" });
      const out = el("div");
      const swatch = el("div", { class: "swatch" });
      body.append(
        el("label", {}, "Hex color"), hex,
        el("button", { class: "btn", onclick: () => {
          try {
            const rgb = lib.hexToRgb(hex.value);
            const hsl = lib.rgbToHsl(rgb);
            swatch.style.background = lib.rgbToHex(rgb);
            showResult(out, true, `HEX:  ${lib.rgbToHex(rgb)}\nRGB:  rgb(${rgb.r}, ${rgb.g}, ${rgb.b})\nHSL:  hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`);
            out.append(swatch);
          } catch (e) { showResult(out, false, e.message); }
        } }, "Convert"),
        out,
      );
    },
  },
  {
    id: "case",
    label: "Case Converter",
    desc: "Convert text between camelCase, snake_case, kebab-case, and more.",
    render(body) {
      const input = el("input", { type: "text", placeholder: "Hello World Example" });
      const out = el("div");
      body.append(
        el("label", {}, "Input"), input,
        el("button", { class: "btn", onclick: () => {
          const v = input.value;
          showResult(out, true,
            `camelCase:    ${lib.toCamelCase(v)}\n` +
            `PascalCase:   ${lib.toPascalCase(v)}\n` +
            `snake_case:   ${lib.toSnakeCase(v)}\n` +
            `kebab-case:   ${lib.toKebabCase(v)}\n` +
            `Title Case:   ${lib.toTitleCase(v)}\n` +
            `CONSTANT_CASE: ${lib.toConstantCase(v)}`);
        } }, "Convert"),
        out,
      );
    },
  },
  {
    id: "lorem",
    label: "Lorem Ipsum",
    desc: "Generate placeholder text.",
    render(body) {
      const paragraphs = el("input", { type: "number", value: "3", min: "1", max: "20" });
      const sentences = el("input", { type: "number", value: "4", min: "1", max: "20" });
      const out = el("div");
      body.append(
        el("div", { class: "row" },
          el("div", {}, el("label", {}, "Paragraphs"), paragraphs),
          el("div", {}, el("label", {}, "Sentences per paragraph"), sentences),
        ),
        el("button", { class: "btn", onclick: () => {
          showResult(out, true, lib.generateLorem(Number(paragraphs.value) || 1, Number(sentences.value) || 1));
        } }, "Generate"),
        out,
      );
    },
  },
  {
    id: "htmlentities",
    label: "HTML Entities",
    desc: "Encode or decode HTML entities.",
    render(body) {
      const input = el("textarea", { placeholder: '<div class="x">Tom & Jerry</div>' });
      const out = el("div");
      body.append(
        el("label", {}, "Input"), input,
        el("div", {},
          el("button", { class: "btn", onclick: () => showResult(out, true, lib.encodeHtmlEntities(input.value)) }, "Encode"),
          el("button", { class: "btn secondary", onclick: () => showResult(out, true, lib.decodeHtmlEntities(input.value)) }, "Decode"),
        ),
        out,
      );
    },
  },
  {
    id: "markdown",
    label: "Markdown Preview",
    desc: "Live preview of a small Markdown subset (headings, bold/italic, code, links, lists).",
    render(body) {
      const input = el("textarea", { placeholder: "# Hello\n\nSome **bold** text." });
      const preview = el("div", { class: "markdown-preview" });
      const update = () => { preview.innerHTML = lib.renderMarkdown(input.value); };
      input.addEventListener("input", update);
      body.append(el("label", {}, "Markdown"), input, preview);
      update();
    },
  },
  {
    id: "qrcode",
    label: "QR Code",
    desc: "Generate a QR code (uses a public image API — needs internet access).",
    render(body) {
      const input = el("input", { type: "text", placeholder: "https://example.com" });
      const out = el("div");
      body.append(
        el("label", {}, "Text or URL"), input,
        el("button", { class: "btn", onclick: () => {
          const url = lib.qrImageUrl(input.value, 220);
          out.innerHTML = "";
          out.append(el("img", { src: url, alt: "QR code", width: "220", height: "220" }));
          out.append(el("div", {}, el("a", { href: url, target: "_blank", rel: "noopener" }, "Open full size")));
        } }, "Generate"),
        out,
      );
    },
  },
];

// ---------- App shell ----------

const sidebar = document.getElementById("sidebar");
const title = document.getElementById("tool-title");
const desc = document.getElementById("tool-desc");
const toolBody = document.getElementById("tool-body");

function selectTool(id) {
  const tool = TOOLS.find((t) => t.id === id) ?? TOOLS[0];
  [...sidebar.children].forEach((btn) => btn.classList.toggle("active", btn.dataset.id === tool.id));
  title.textContent = tool.label;
  desc.textContent = tool.desc;
  toolBody.innerHTML = "";
  tool.render(toolBody);
  history.replaceState(null, "", `#${tool.id}`);
}

TOOLS.forEach((tool) => {
  sidebar.append(el("button", { "data-id": tool.id, onclick: () => selectTool(tool.id) }, tool.label));
});

selectTool(location.hash.slice(1) || TOOLS[0].id);
