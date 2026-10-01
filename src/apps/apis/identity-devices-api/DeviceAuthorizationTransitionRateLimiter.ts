import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorizationTransitionRateLimitExceededError } from './errors/DeviceAuthorizationTransitionRateLimitExceededError';

type Window = { count: number; resetAt: number };

/**
 * Bounds unauthenticated transition submissions before they take a
 * per-identity lock or trigger a remote identity lookup.
 */
export default class DeviceAuthorizationTransitionRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly IDENTITY_LIMIT = 20;
  public static readonly NODE_LIMIT = 300;
  public static readonly MAX_TRACKED_IDENTITIES = 10_000;

  private readonly identities = new Map<string, Window>();
  private nodeWindow: Window = { count: 0, resetAt: 0 };

  private advance(current: Window | undefined, now: number): Window {
    if (!current || current.resetAt <= now) {
      return {
        count: 1,
        resetAt: now + DeviceAuthorizationTransitionRateLimiter.WINDOW_MS,
      };
    }

    return { count: current.count + 1, resetAt: current.resetAt };
  }

  private evictExpired(now: number): void {
    if (
      this.identities.size <
      DeviceAuthorizationTransitionRateLimiter.MAX_TRACKED_IDENTITIES
    ) {
      return;
    }

    this.identities.forEach((window, key) => {
      if (window.resetAt <= now) {
        this.identities.delete(key);
      }
    });
  }

  public consume(identityId: IdentityId, now = Date.now()): void {
    const limiter = DeviceAuthorizationTransitionRateLimiter;
    const key = identityId.valueOf();

    this.nodeWindow = this.advance(this.nodeWindow, now);
    this.evictExpired(now);
    const tracked =
      this.identities.has(key) ||
      this.identities.size < limiter.MAX_TRACKED_IDENTITIES;
    const identityWindow = this.advance(this.identities.get(key), now);

    if (tracked) {
      this.identities.set(key, identityWindow);
    }

    if (
      this.nodeWindow.count > limiter.NODE_LIMIT ||
      !tracked ||
      identityWindow.count > limiter.IDENTITY_LIMIT
    ) {
      throw new DeviceAuthorizationTransitionRateLimitExceededError();
    }
  }
}
