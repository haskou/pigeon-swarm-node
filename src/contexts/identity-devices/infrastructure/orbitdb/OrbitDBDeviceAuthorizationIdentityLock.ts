import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { diag, diagSpan } from '@app/contexts/shared/infrastructure/diag/Diag';

export default class OrbitDBDeviceAuthorizationIdentityLock {
  private readonly identityQueues = new Map<string, Promise<void>>();
  private readonly holders = new Map<string, string>();

  public async run<T>(
    identityId: IdentityId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = identityId.valueOf();
    const caller = (new Error().stack ?? '')
      .split('\n')
      .slice(2, 7)
      .join(' | ');
    const previous = this.identityQueues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);

    this.identityQueues.set(key, queued);
    const holder = this.holders.get(key);

    if (holder) {
      diag(`LOCK contended key=${key} caller=${caller} HOLDER=${holder}`);
    }

    await diagSpan(
      `lock-wait key=${key} caller=${caller} holder=${holder ?? 'none'}`,
      () => previous,
    );
    this.holders.set(key, caller);

    try {
      return await diagSpan(`lock-hold key=${key} caller=${caller}`, operation);
    } finally {
      this.holders.delete(key);
      release();

      if (this.identityQueues.get(key) === queued) {
        this.identityQueues.delete(key);
      }
    }
  }
}
