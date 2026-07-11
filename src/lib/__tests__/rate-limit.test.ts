import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { checkRateLimit } from "../rate-limit";

describe("rate limiter", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("allows up to the limit, then blocks with retry info", () => {
    const key = `ip-${Math.random()}`;
    for (let i = 0; i < 15; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMin).toBeGreaterThan(0);
  });

  test("keys are independent", () => {
    const a = `ip-${Math.random()}`;
    const b = `ip-${Math.random()}`;
    for (let i = 0; i < 15; i++) checkRateLimit(a);
    expect(checkRateLimit(b).allowed).toBe(true);
  });

  test("disabled outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const key = `ip-${Math.random()}`;
    for (let i = 0; i < 50; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
  });
});
