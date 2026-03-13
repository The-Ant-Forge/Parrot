/**
 * Simple circuit breaker for community proxy endpoints.
 * After maxFailures consecutive failures, the breaker "opens" and
 * skips the proxy for cooldownMs, going straight to fallback.
 * Resets on success or after cooldown expires.
 */
export interface CircuitBreaker {
  isOpen(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}

export function createCircuitBreaker(
  maxFailures = 3,
  cooldownMs = 5 * 60 * 1000,
): CircuitBreaker {
  let failures = 0;
  let openUntil = 0;

  return {
    isOpen: () => Date.now() < openUntil,
    recordSuccess: () => { failures = 0; },
    recordFailure: () => {
      if (++failures >= maxFailures) {
        openUntil = Date.now() + cooldownMs;
        failures = 0;
      }
    },
  };
}
