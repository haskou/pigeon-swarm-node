import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorizationTransitionRateLimitExceededError } from './errors/DeviceAuthorizationTransitionRateLimitExceededError';

type Window = { count: number; resetAt: number };

export interface DeviceAuthorizationRateLimits {
  identityLimit: number;
  maxTrackedIdentities: number;
  nodeLimit: number;
  windowMs: number;
}

/**
 * A fixed window per identity plus one for the whole node, so a flood of
 * distinct identities cannot bypass the per-identity cap.
 */
export abstract class DeviceAuthorizationRateLimiter {
  private readonly identities = new Map<string, Window>();
  private nodeWindow: Window = { count: 0, resetAt: 0 };

  protected constructor(private readonly limits: DeviceAuthorizationRateLimits) {}

  private advance(current: Window | undefined, now: number): Window {
    if (!current || current.resetAt <= now) {
      return { count: 1, resetAt: now + this.limits.windowMs };
    }

    return { count: current.count + 1, resetAt: current.resetAt };
  }

  private evictExpired(now: number): void {
    if (this.identities.size < this.limits.maxTrackedIdentities) {
      return;
    }

    this.identities.forEach((window, key) => {
      if (window.resetAt <= now) {
        this.identities.delete(key);
      }
    });
  }

  public consume(identityId: IdentityId, now = Date.now()): void {
    const key = identityId.valueOf();

    this.nodeWindow = this.advance(this.nodeWindow, now);
    this.evictExpired(now);
    const tracked =
      this.identities.has(key) ||
      this.identities.size < this.limits.maxTrackedIdentities;
    const identityWindow = this.advance(this.identities.get(key), now);

    if (tracked) {
      this.identities.set(key, identityWindow);
    }

    if (
      this.nodeWindow.count > this.limits.nodeLimit ||
      !tracked ||
      identityWindow.count > this.limits.identityLimit
    ) {
      throw new DeviceAuthorizationTransitionRateLimitExceededError();
    }
  }
}
