// Pure logic for every tool: no DOM, so this module is imported both by the
// browser (main.js) and by the tests (node --test) with the same code path.

// ---------- JSON ----------

export function formatJson(input, indent = 2) {
  try {
    return { ok: true, output: JSON.stringify(JSON.parse(input), null, indent) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function minifyJson(input) {
  try {
    return { ok: true, output: JSON.stringify(JSON.parse(input)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------- Base64 ----------

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    const triplet = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += B64_CHARS[(triplet >> 18) & 63];
    out += B64_CHARS[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? B64_CHARS[(triplet >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64_CHARS[triplet & 63] : "=";
  }
  return out;
}

function base64ToBytes(b64) {
  const clean = b64.replace(/=+$/, "");
  const bytes = [];
  let buffer = 0, bits = 0;
  for (const char of clean) {
    const val = B64_CHARS.indexOf(char);
    if (val === -1) throw new Error(`Invalid base64 character: ${JSON.stringify(char)}`);
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export function base64Encode(str) {
  return bytesToBase64(new TextEncoder().encode(str));
}

export function base64Decode(str) {
  return new TextDecoder().decode(base64ToBytes(str));
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return base64Decode(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

// ---------- URL encoding ----------

export function urlEncode(str) {
  return encodeURIComponent(str);
}

export function urlDecode(str) {
  return decodeURIComponent(str);
}

// ---------- JWT (decode only, no signature verification) ----------

export function decodeJwt(token) {
  const parts = token.trim().split(".");
  if (parts.length < 2) throw new Error("Not a JWT: expected at least header.payload");
  return {
    header: JSON.parse(base64UrlDecode(parts[0])),
    payload: JSON.parse(base64UrlDecode(parts[1])),
    signaturePresent: parts.length === 3 && parts[2].length > 0,
  };
}

// ---------- Hashes ----------

// MD5 (RFC 1321) — not in the Web Crypto API, so implemented directly.
export function md5(message) {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const rotl = (x, c) => (x << c) | (x >>> (32 - c));

  const bytes = Array.from(new TextEncoder().encode(message));
  const bitLenLow = (bytes.length * 8) >>> 0;
  const bitLenHigh = Math.floor(bytes.length / 536870912); // (bytes*8) >>> 32, for inputs beyond 32-bit length
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 4; i++) bytes.push((bitLenLow >>> (8 * i)) & 0xff);
  for (let i = 0; i < 4; i++) bytes.push((bitLenHigh >>> (8 * i)) & 0xff);

  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const M = new Array(16);
    for (let i = 0; i < 16; i++) {
      const o = chunk + i * 4;
      M[i] = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24);
    }
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }

  const toHexLE = (n) => {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  };
  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

// SHA-1/256/384/512 via the Web Crypto API (available in browsers and Node 19+).
export async function sha(str, algo = "SHA-256") {
  const digest = await crypto.subtle.digest(algo, new TextEncoder().encode(str));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- UUID ----------

export function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

// ---------- Timestamp ----------

export function epochToDate(value, unit = "ms") {
  const ms = unit === "s" ? value * 1000 : value;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid timestamp");
  return { iso: d.toISOString(), local: d.toString(), utc: d.toUTCString() };
}

export function dateToEpoch(str) {
  const ms = Date.parse(str);
  if (Number.isNaN(ms)) throw new Error("Invalid date string");
  return { ms, s: Math.floor(ms / 1000) };
}

// ---------- Cron explainer ----------

const CRON_FIELD_NAMES = ["minute", "hour", "day-of-month", "month", "day-of-week"];
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeCronField(field, index) {
  if (field === "*") return `every ${CRON_FIELD_NAMES[index]}`;
  if (field.startsWith("*/")) return `every ${field.slice(2)} ${CRON_FIELD_NAMES[index]}(s)`;
  if (field.includes(",")) return `${CRON_FIELD_NAMES[index]} in {${field}}`;
  if (field.includes("-")) return `${CRON_FIELD_NAMES[index]} ${field.replace("-", " through ")}`;
  return `${CRON_FIELD_NAMES[index]} ${field}`;
}

export function explainCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Expected 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}`);
  }
  const [min, hour, dom, month, dow] = parts;
  const hhmm = (h, m) => `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;

  if ([min, hour, dom, month, dow].every((f) => f === "*")) return "Runs every minute.";
  if (min.startsWith("*/") && [hour, dom, month, dow].every((f) => f === "*")) {
    return `Runs every ${min.slice(2)} minutes.`;
  }
  if (/^\d+$/.test(min) && hour === "*" && [dom, month, dow].every((f) => f === "*")) {
    return `Runs every hour, at minute ${min}.`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && [dom, month, dow].every((f) => f === "*")) {
    return `Runs every day at ${hhmm(hour, min)}.`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && month === "*" && /^\d+$/.test(dow)) {
    return `Runs every week on ${DOW_NAMES[+dow % 7]} at ${hhmm(hour, min)}.`;
  }
  return `Runs at ${[min, hour, dom, month, dow].map(describeCronField).join(", ")}.`;
}

// ---------- Regex tester ----------

export function testRegex(pattern, flags, text) {
  const re = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({ match: m[0], index: m.index, groups: m.groups ? { ...m.groups } : null, captures: m.slice(1) });
    if (m[0] === "") re.lastIndex++; // avoid an infinite loop on zero-width matches
  }
  return matches;
}

// ---------- Line diff (LCS) ----------

export function diffLines(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: "same", text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "remove", text: A[i] }); i++; }
    else { out.push({ type: "add", text: B[j] }); j++; }
  }
  while (i < n) out.push({ type: "remove", text: A[i++] });
  while (j < m) out.push({ type: "add", text: B[j++] });
  return out;
}

// ---------- Color conversion ----------

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error("Invalid hex color");
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) { h = s = 0; } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

// ---------- Case conversion ----------

function splitWords(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export function toCamelCase(str) {
  const words = splitWords(str);
  return words.map((w, i) => (i === 0 ? w : cap(w))).join("");
}
export function toPascalCase(str) { return splitWords(str).map(cap).join(""); }
export function toSnakeCase(str) { return splitWords(str).join("_"); }
export function toKebabCase(str) { return splitWords(str).join("-"); }
export function toTitleCase(str) { return splitWords(str).map(cap).join(" "); }
export function toConstantCase(str) { return splitWords(str).join("_").toUpperCase(); }

// ---------- Lorem ipsum ----------

// The classic scrambled-Latin placeholder word list — public domain and used by
// virtually every design/dev tool; not a creative work anyone holds rights to.
const LOREM_WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do",
  "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua", "enim",
  "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi",
  "aliquip", "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in", "reprehenderit",
  "voluptate", "velit", "esse", "cillum", "eu", "fugiat", "nulla", "pariatur", "excepteur",
  "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum",
];

// A small seeded PRNG so output is reproducible for a given seed (useful for tests).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateLorem(paragraphs = 3, sentencesPerParagraph = 4, seed = Date.now()) {
  const rand = mulberry32(seed);
  const pick = () => LOREM_WORDS[Math.floor(rand() * LOREM_WORDS.length)];
  const sentence = () => {
    const len = 6 + Math.floor(rand() * 10);
    const words = Array.from({ length: len }, pick);
    return cap(words.join(" ")) + ".";
  };
  const out = [];
  for (let p = 0; p < paragraphs; p++) {
    const sentences = ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."];
    const count = p === 0 ? sentencesPerParagraph - 1 : sentencesPerParagraph;
    for (let s = 0; s < count; s++) sentences.push(sentence());
    out.push(sentences.join(" "));
  }
  return out.join("\n\n");
}

// ---------- HTML entities ----------

const ENTITY_ENCODE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const ENTITY_DECODE = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function encodeHtmlEntities(str) {
  return str.replace(/[&<>"']/g, (c) => ENTITY_ENCODE[c]);
}

export function decodeHtmlEntities(str) {
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    return entity in ENTITY_DECODE ? ENTITY_DECODE[entity] : whole;
  });
}

// ---------- Markdown (small subset) ----------

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markdownInline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// A deliberately small subset: headings, bold/italic/code, links, lists, code fences.
// Not a full CommonMark implementation.
export function renderMarkdown(md) {
  const lines = escapeHtml(md).split("\n");
  let html = "";
  let inCode = false;
  let listTag = null;
  const closeList = () => { if (listTag) { html += `</${listTag}>`; listTag = null; } };

  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      closeList();
      html += inCode ? "</code></pre>" : "<pre><code>";
      inCode = !inCode;
      continue;
    }
    if (inCode) { html += raw + "\n"; continue; }

    const heading = raw.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${markdownInline(heading[2])}</h${level}>`;
      continue;
    }
    const ordered = raw.match(/^\d+\.\s+(.*)/);
    const unordered = raw.match(/^[-*]\s+(.*)/);
    if (ordered) {
      if (listTag !== "ol") { closeList(); html += "<ol>"; listTag = "ol"; }
      html += `<li>${markdownInline(ordered[1])}</li>`;
      continue;
    }
    if (unordered) {
      if (listTag !== "ul") { closeList(); html += "<ul>"; listTag = "ul"; }
      html += `<li>${markdownInline(unordered[1])}</li>`;
      continue;
    }
    closeList();
    if (raw.trim() !== "") html += `<p>${markdownInline(raw)}</p>`;
  }
  closeList();
  return html;
}

// ---------- QR code (delegated to a public image API; see main.js) ----------

export function qrImageUrl(text, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}
