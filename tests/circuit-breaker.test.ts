import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCircuitBreaker } from "../src/common/circuit-breaker";

describe("createCircuitBreaker", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("starts closed", () => {
    const cb = createCircuitBreaker();
    expect(cb.isOpen()).toBe(false);
  });

  it("stays closed after fewer failures than threshold", () => {
    const cb = createCircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false);
  });

  it("opens after reaching failure threshold", () => {
    const cb = createCircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
  });

  it("closes after cooldown period expires", () => {
    const cb = createCircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);

    vi.advanceTimersByTime(1001);
    expect(cb.isOpen()).toBe(false);
  });

  it("resets failure count on success", () => {
    const cb = createCircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    // Only 1 failure since reset, not 3
    expect(cb.isOpen()).toBe(false);
  });

  it("uses default values when no arguments provided", () => {
    const cb = createCircuitBreaker();
    // Default is 3 failures
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);

    // Default cooldown is 5 minutes
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(cb.isOpen()).toBe(true);
    vi.advanceTimersByTime(61 * 1000);
    expect(cb.isOpen()).toBe(false);
  });

  it("does not double-trip after cooldown expires", () => {
    const cb = createCircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);

    // After cooldown, breaker is half-open
    vi.advanceTimersByTime(1001);
    expect(cb.isOpen()).toBe(false);

    // Single failure should not re-trip (count was reset)
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false);
  });
});
