import { createHash } from 'crypto';

type SyncResourceKind =
  | 'community'
  | 'conversation'
  | 'identity'
  | 'ipfs-content-replication'
  | 'keychain';

export default class SyncResponseSuppressionTracker {
  private static readonly MAX_DELAY_MS = 750;
  private static readonly MIN_DELAY_MS = 50;
  private static instance: SyncResponseSuppressionTracker | undefined;

  private readonly completedResponses: Set<string> = new Set();

  public static shared(): SyncResponseSuppressionTracker {
    if (!SyncResponseSuppressionTracker.instance) {
      SyncResponseSuppressionTracker.instance =
        new SyncResponseSuppressionTracker();
    }

    return SyncResponseSuppressionTracker.instance;
  }

  private getKey(
    kind: SyncResourceKind,
    resourceId: string,
    requestId: string,
  ): string {
    return `${kind}:${resourceId}:${requestId}`;
  }

  private getDelayMs(key: string): number {
    const seed = [
      key,
      process.env.NODE_ID,
      process.env.SERVICE_NAME,
      process.pid,
    ].join(':');
    const hash = createHash('sha256').update(seed).digest('hex');
    const value = Number.parseInt(hash.slice(0, 8), 16);
    const range =
      SyncResponseSuppressionTracker.MAX_DELAY_MS -
      SyncResponseSuppressionTracker.MIN_DELAY_MS;

    return SyncResponseSuppressionTracker.MIN_DELAY_MS + (value % range);
  }

  private async wait(key: string): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, this.getDelayMs(key));
    });
  }

  public markAvailable(
    kind: SyncResourceKind,
    resourceId: string,
    requestId: string | undefined,
  ): void {
    if (!requestId) {
      return;
    }

    this.completedResponses.add(this.getKey(kind, resourceId, requestId));
  }

  public async shouldRespond(
    kind: SyncResourceKind,
    resourceId: string,
    requestId: string | undefined,
  ): Promise<boolean> {
    if (!requestId) {
      return true;
    }

    const key = this.getKey(kind, resourceId, requestId);

    if (this.completedResponses.has(key)) {
      return false;
    }

    await this.wait(key);

    if (this.completedResponses.has(key)) {
      return false;
    }

    this.completedResponses.add(key);

    return true;
  }
}
