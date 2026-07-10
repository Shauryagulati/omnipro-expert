import { describe, expect, test } from "vitest";
import { validateArtifact } from "@/agent/artifact";

describe("artifact validation", () => {
  test("clean self-contained HTML passes", () => {
    const r = validateArtifact(
      `<div><style>.a{color:red}</style><script>document.querySelector('.a')</script><p class="a">hi</p></div>`,
    );
    expect(r.ok).toBe(true);
  });

  test("local product images are allowed", () => {
    const r = validateArtifact(
      `<img src="/products/vulcan-omnipro-220/figures/owner-manual-p08-f1.png">`,
    );
    expect(r.ok).toBe(true);
  });

  test("external script src is rejected", () => {
    const r = validateArtifact(`<script src="https://cdn.example.com/x.js"></script>`);
    expect(r.ok).toBe(false);
  });

  test("fetch calls are rejected", () => {
    const r = validateArtifact(`<script>fetch('https://evil.example.com')</script>`);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/fetch/);
  });

  test("external image URL is rejected", () => {
    const r = validateArtifact(`<img src="https://example.com/x.png">`);
    expect(r.ok).toBe(false);
  });

  test("oversized payload is rejected", () => {
    const r = validateArtifact(`<div>${"x".repeat(70_000)}</div>`);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/too large/);
  });

  test("unbalanced script tags are rejected", () => {
    const r = validateArtifact(`<div><script>let a=1;</div>`);
    expect(r.ok).toBe(false);
  });
});
