// Server-side validation for model-generated HTML artifacts. The sandbox
// (iframe allow-scripts, no same-origin) is the security boundary; these
// checks are the *reliability* boundary — no external requests that would
// break offline/CSP, no oversized payloads, no obvious foot-guns. Failures
// go back to the model as tool errors so it can fix and retry.

const MAX_BYTES = 60_000;

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bfetch\s*\(/i, reason: "no network calls (fetch)" },
  { pattern: /XMLHttpRequest/i, reason: "no network calls (XHR)" },
  { pattern: /\bWebSocket\b/, reason: "no network calls (WebSocket)" },
  { pattern: /\bEventSource\b/, reason: "no network calls (EventSource)" },
  { pattern: /\bimport\s*\(/, reason: "no dynamic imports" },
  { pattern: /<script[^>]+src\s*=/i, reason: "no external scripts — inline all JS" },
  { pattern: /<link[^>]+href\s*=/i, reason: "no external stylesheets — inline all CSS" },
  { pattern: /url\s*\(\s*['"]?https?:/i, reason: "no external CSS resources" },
  { pattern: /@import/i, reason: "no CSS imports" },
];

// http(s) URLs are allowed nowhere except nowhere — local /products/ paths and
// data: URIs cover every legitimate need (manual figures, generated graphics).
const EXTERNAL_URL = /\b(?:src|href)\s*=\s*["']https?:\/\//i;

export interface ArtifactCheck {
  ok: boolean;
  errors: string[];
}

export function validateArtifact(html: string): ArtifactCheck {
  const errors: string[] = [];

  const bytes = Buffer.byteLength(html, "utf-8");
  if (bytes > MAX_BYTES) {
    errors.push(`too large: ${bytes} bytes (max ${MAX_BYTES}) — simplify`);
  }
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    errors.push("not HTML — provide a self-contained HTML fragment or document");
  }
  for (const { pattern, reason } of FORBIDDEN) {
    if (pattern.test(html)) errors.push(reason);
  }
  if (EXTERNAL_URL.test(html)) {
    errors.push(
      "no external URLs — use local /products/vulcan-omnipro-220/... image paths or data: URIs",
    );
  }
  const opens = (html.match(/<script\b/gi) ?? []).length;
  const closes = (html.match(/<\/script>/gi) ?? []).length;
  if (opens !== closes) errors.push("unbalanced <script> tags");

  return { ok: errors.length === 0, errors };
}
