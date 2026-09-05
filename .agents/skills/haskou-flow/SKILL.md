---
name: haskou-flow
description: "Use @haskou/flow when implementing, refactoring, reviewing, or testing TypeScript async coordination: concurrency limits, queues, rate limiting, timeouts, retries, racing, abort signals, scheduled jobs, debouncing, throttling, circuit breakers, fallback chains, or Flow/FlowPipeline composition."
---

# @haskou/flow

Use `@haskou/flow` to make promise-producing work run with explicit coordination rules instead of ad hoc timers, booleans, shared counters, or retry loops.

The npm package documentation checked for this skill is `@haskou/flow@0.1.1`. The README points to `https://haskou.github.io/flow/`, but that page returned GitHub Pages "Site not found" when this skill was written. The package README and upstream repository docs were used instead.

## First Steps

1. Check whether the project already depends on `@haskou/flow` and `@haskou/value-objects`.
2. Import flow-control classes from `@haskou/flow`.
3. Use `Duration` from `@haskou/value-objects` for time inputs unless existing code consistently uses millisecond numbers at infrastructure boundaries.
4. Keep domain behavior in the domain model. Use flow classes to coordinate execution, not to hide business rules.
5. Load [api-reference.md](references/api-reference.md) when exact constructors, methods, option classes, or error classes matter.

```typescript
import { Flow, RetryOptions, Semaphore } from '@haskou/flow';
import { Duration } from '@haskou/value-objects';

const result = await new Flow()
  .task((signal) => fetchSomething({ signal }))
  .timeout(Duration.fromSeconds(3))
  .retry(new RetryOptions(3))
  .limit(new Semaphore(2))
  .run();
```

## Choose The Class

- Use `Semaphore` when unrelated code paths must share a fixed capacity and callers may wait for a permit.
- Use `Queue` when submitted tasks should wait their turn and each caller receives its own result.
- Use `RateLimiter` when task starts must be spaced by a fixed interval, often for provider/API quotas.
- Use `Timeout` or `Flow.timeout()` when slow work must reject and receive an `AbortSignal`.
- Use `Retrier` or `Flow.retry()` for transient failures where retrying the same operation is valid.
- Use `CircuitBreaker` around unstable external dependencies after repeated failures should block more calls temporarily.
- Use `FallbackChain` when ordered sources can produce the same value, such as memory, cache, database, then remote API.
- Use `Racer` when alternative sources can run concurrently and the first successful value should win.
- Use `Abortable` when a caller must cancel running work externally.
- Use `Scheduler` for repeated background work that must not overlap with a previous run.
- Use `Debouncer` to collapse bursts into one latest operation.
- Use `Throttler` when every submitted task should run, but starts must be spaced.
- Use `Flow` when one task needs several controls in a readable chain.
- Use `FlowPipeline` only for lower-level composition of classes exposing `run(task)`; prefer `Flow` for new code that needs timeout, retry, racing, or abortability.

## Composition Rules

Make ordering visible. `Flow` steps are applied in chain order around the task, so put the controls in the order that expresses the intended execution boundary.

```typescript
const user = await new Flow()
  .task((signal) => remoteUsers.get(id, { signal }))
  .timeout(Duration.fromSeconds(2))
  .retry(new RetryOptions(3, Duration.fromMilliseconds(50)))
  .rateLimit(userProviderRateLimiter)
  .circuitBreaker(userProviderBreaker)
  .run();
```

Share long-lived controllers when the policy is shared. For example, a provider-wide `Semaphore`, `RateLimiter`, or `CircuitBreaker` should be injected/reused instead of constructed inside every call.

Use `FlowPipeline` for reusable `run(task)` chains:

```typescript
const pipeline = new FlowPipeline()
  .through(queue)
  .through(rateLimiter)
  .through(circuitBreaker);

await pipeline.run(() => callProvider());
```

## Error Handling

Catch library-specific errors only when the caller can recover from that flow-control decision. Let task errors propagate unless the application boundary has a clear mapping.

```typescript
try {
  await breaker.run(() => callProvider());
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    return cachedFallback;
  }

  throw error;
}
```

Important recoverable errors include `TimeoutError`, `CircuitBreakerOpenError`, `QueueClearedError`, `FlowCancelledError`, `FlowAbortedError`, `FallbackChainExhaustedError`, `RacerExhaustedError`, and `SchedulerAlreadyRunningError`.

## Testing Guidance

Test the behavior at the coordination boundary:

- For queues, semaphores, throttlers, and rate limiters, assert ordering, active counts, waiting counts, or elapsed scheduling behavior with fake timers when the project already uses them.
- For timeouts and abortability, assert that the task receives an `AbortSignal` and that the expected error class is thrown.
- For retries and circuit breakers, assert attempt counts and state transitions through the public API.
- For fallback chains and racers, assert source order or first-success behavior without depending on primitive internals of value objects.

Avoid testing implementation details such as internal timers or private counters unless the production API exposes no safer observation point.
