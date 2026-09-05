# @haskou/flow API Reference

This reference summarizes the package README and upstream repository docs for `@haskou/flow@0.1.1`.

## Installation

```bash
npm install @haskou/flow
yarn add @haskou/flow
```

Import flow classes from `@haskou/flow`. Import `Duration` from `@haskou/value-objects` for readable time values.

## Flow

`Flow<T = unknown>` builds a runnable async task with visible execution rules.

- Constructor: `new Flow()`.
- Task source: `task(task)` or `race(racer)`.
- Steps: `timeout(duration)`, `retry(options)`, `limit(semaphore)`, `queue(queue)`, `rateLimit(rateLimiter)`, `throttle(throttler)`, `circuitBreaker(circuitBreaker)`, `abortable(abortable)`, `through(controller)`.
- Run: `run()`.
- Throws: `FlowTaskMissingError`, task errors, and errors from configured steps.
- Notes: `task()` may receive an `AbortSignal`; `task()` returns a typed `Flow<TResult>`.

## Concurrency

### Semaphore

`Semaphore` limits concurrent access to a shared capacity.

- Constructor: `new Semaphore(permits: number)`.
- Methods: `acquire(signal?)`, `tryAcquire()`, `runExclusive(task)`, `run(task)`, `getCapacity()`, `getAvailablePermits()`, `getWaitingCount()`.
- `SemaphorePermit.release()` releases a permit exactly once.
- Throws: `InvalidSemaphorePermitsError`, `SemaphoreReleasedError`, `FlowAbortedError` for aborted waiters.
- Notes: `runExclusive()`/`run()` release in `finally`; waiters resume FIFO.

### Queue

`Queue` runs submitted tasks with bounded concurrency.

- Constructor: `new Queue(options = new QueueOptions())`.
- Options: `new QueueOptions(concurrency = Concurrency.DEFAULT)`, `QueueOptions.withConcurrency(concurrency)`.
- Methods: `enqueue(task)`, `run(task)`, `clear(error?)`, `waitUntilIdle()`, `getConcurrency()`, `getPendingCount()`, `getActiveCount()`.
- Throws: `InvalidQueueConcurrencyError`, `QueueClearedError`, task errors.
- Notes: `clear()` rejects pending work only; active tasks continue.

## Timing

### RateLimiter

`RateLimiter` spaces queued task starts by a fixed interval.

- Constructor: `new RateLimiter(options: RateLimiterOptions)`.
- Options: `new RateLimiterOptions(interval, queueOptions = new QueueOptions())`; interval accepts milliseconds, `Duration`, or `RateLimiterInterval`.
- Methods: `schedule(task)`, `run(task)`, `waitUntilIdle()`.
- Throws: `InvalidRateLimiterIntervalError`, task errors.
- Notes: first task runs immediately; later tasks wait since the previously reserved start.

### Timeout

`Timeout` rejects work that does not finish before the configured duration.

- Constructor: `new Timeout(duration: number | Duration | TimeoutDuration)`.
- Method: `run(task, signal?)`.
- Throws: `InvalidTimeoutDurationError`, `TimeoutError`, `FlowAbortedError`, task errors.
- Notes: number inputs are milliseconds; timeout aborts the task signal before rejecting.

### Scheduler

`Scheduler` runs a periodic task without overlapping executions.

- Constructor: `new Scheduler(options: SchedulerOptions)`.
- Options: `new SchedulerOptions(interval, task, errorPolicy = SchedulerErrorPolicy.THROW, semaphore = new Semaphore(1))`.
- Methods: `start()`, `stop()`, `isRunning()`, `runOnce()`, `assertStopped()`.
- `SchedulerErrorPolicy`: `THROW`, `SWALLOW`, with `isThrow()` and `isSwallow()`.
- Throws: `InvalidSchedulerIntervalError`, `SchedulerAlreadyRunningError`, task errors when policy is `THROW`.
- Notes: `start()` and `stop()` are idempotent; `runOnce()` returns `false` when another run is active.

### Debouncer

`Debouncer<T>` delays execution until calls stop arriving for the configured delay.

- Constructor: `new Debouncer<T>(delay: number | Duration | DebounceDelay)`.
- Methods: `run(task)`, `cancel(error?)`.
- Throws: `InvalidDebouncerDelayError`, `FlowCancelledError`, latest task errors.
- Notes: only the latest task function executes; all pending callers resolve/reject with the same result/error.

### Throttler

`Throttler` runs every task, one at a time, keeping at least the configured interval between starts.

- Constructor: `new Throttler(interval: number | Duration | ThrottleInterval)`.
- Methods: `run(task)`, `waitUntilIdle()`.
- Throws: `InvalidThrottlerIntervalError`, task errors.
- Notes: first task runs immediately; unlike `Debouncer`, intermediate calls are not dropped.

## Resilience

### Retrier

`Retrier` retries a failing task until it succeeds or attempts are exhausted.

- Constructor: `new Retrier(options = new RetryOptions())`.
- Options: `new RetryOptions(attempts = RetryAttempts.ONCE, delay = RetryDelay.none())`.
- Method: `run(task, signal?)`.
- Throws: `InvalidRetryAttemptsError`, `InvalidRetryDelayError`, `FlowAbortedError`, and the last task error.

### CircuitBreaker

`CircuitBreaker` rejects work after repeated failures and later allows half-open probe calls.

- Constructor: `new CircuitBreaker(options: CircuitBreakerOptions)`.
- Options: `new CircuitBreakerOptions(failureThreshold, recoveryTimeout, successThreshold = 1, halfOpenMaxConcurrent = 1)`.
- Methods: `execute(task)`, `run(task)`, `reset()`, `getState()`, `getFailureCount()`.
- Throws: `CircuitBreakerOpenError`, validation errors, task errors.
- State transitions: `closed` opens when failures reach threshold; `open` becomes `half-open` after recovery timeout; enough half-open successes close it; any half-open failure opens it.
- Notes: extra half-open probes throw `CircuitBreakerOpenError`.

### CircuitBreakerState

State values are `closed`, `open`, and `half-open`. Use the public state/value-object behavior exposed by the package instead of comparing extracted primitives in domain/application code.

## Fallbacks And Racing

### FallbackChain

`FallbackChain<T>` resolves the first non-nullish value from ordered sources.

- Constructor: `new FallbackChain<T>(options = FallbackChainOptions.default())`.
- Methods: `try(attempt)`, `onError(handler)`, `run()`.
- Attempt wrapper: `new FallbackAttempt(attempt)` with `run()`.
- Throws: `FallbackChainExhaustedError`, attempt errors unless catch mode is enabled.
- Notes: only `null` and `undefined` mean unavailable; `false`, `0`, and `''` are valid results. Use `FallbackChainOptions.catchingErrors()` for best-effort fallback and `onError()` for observability.

### Racer

`Racer` runs candidates and resolves with the first successful value.

- Methods: `task(task)`, `add(task)`, `run(signal?)`.
- Throws: `RacerExhaustedError` if no candidate succeeds.
- Notes: combine with `Flow.retry()` when the race itself should be retried.

## Abortability

`Abortable` owns an `AbortController` for cancellable work.

- Constructor: `new Abortable()`.
- Methods: `abort()`, `getSignal()`, `run(task)`.
- Throws: `FlowAbortedError`, task errors.
- Notes: use `Flow.abortable(abortable)` when external callers need to cancel a running flow.

## FlowPipeline

`FlowPipeline` composes objects exposing `run(task)`.

- Constructor: `new FlowPipeline()`.
- Methods: `through(controller)`, `run(task)`.
- Compatible built-ins: `Semaphore`, `Queue`, `RateLimiter`, `Throttler`, `CircuitBreaker`.
- Notes: empty pipelines run the task directly; prefer `Flow` for new code needing timeout, retry, racing, or abortability.

## Configuration Values

Most constructors accept numbers for convenience. Time numbers are milliseconds. Prefer explicit values when the policy is named or reused.

- Concurrency: `Concurrency`, `SemaphoreCapacity`.
- Timing: `RateLimiterInterval`, `SchedulerInterval`, `DebounceDelay`, `ThrottleInterval`, `TimeoutDuration`, `CircuitBreakerRecoveryTimeout`, `RetryDelay`.
- Retry: `RetryAttempts`.

## Error Classes

All library-specific errors extend `FlowError`.

- `SemaphoreReleasedError`: permit released more than once.
- `QueueClearedError`: pending queue work cleared before start.
- `CircuitBreakerOpenError`: breaker rejected execution.
- `FlowCancelledError`: pending debounce work cancelled.
- `FlowAbortedError`: running work aborted.
- `FlowTaskMissingError`: `Flow.run()` called without a task.
- `FallbackChainExhaustedError`: no fallback attempt produced a value.
- `TimeoutError`: work exceeded timeout.
- `RacerExhaustedError`: no racer candidate succeeded.
- `SchedulerAlreadyRunningError`: stopped state required but scheduler is running.
- Validation errors: `InvalidSemaphorePermitsError`, `InvalidQueueConcurrencyError`, `InvalidRateLimiterIntervalError`, `InvalidSchedulerIntervalError`, `InvalidDebouncerDelayError`, `InvalidThrottlerIntervalError`, `InvalidTimeoutDurationError`, `InvalidRetryAttemptsError`, `InvalidRetryDelayError`, `InvalidCircuitBreakerFailureThresholdError`, `InvalidCircuitBreakerRecoveryTimeoutError`, `InvalidCircuitBreakerSuccessThresholdError`, `InvalidCircuitBreakerHalfOpenMaxConcurrentError`.
