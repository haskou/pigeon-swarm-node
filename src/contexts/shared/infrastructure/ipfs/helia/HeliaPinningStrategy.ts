import Kernel from '@haskou/ddd-kernel';

import { HeliaInstance, ParsedCidLike } from './adapters/HeliaRuntimeAdapter';

export default class HeliaPinningStrategy {
  private static readonly FAILED_PIN_RETRY_INTERVAL_MS = 60_000;

  private readonly locallyPinnedCids = new Set<string>();

  private readonly failedPinRetryAt = new Map<string, number>();

  private readonly pinningOperations = new Map<string, Promise<void>>();

  private debug(message: string): void {
    Kernel.logger.debug?.(message);
  }

  private async consumePinOperation(
    operation: AsyncGenerator<ParsedCidLike, void, undefined>,
  ): Promise<void> {
    for await (const cid of operation) {
      void cid;
    }
  }

  private cacheKey(cid: ParsedCidLike): string {
    return cid.toString();
  }

  private shouldSkipFailedPin(cacheKey: string): boolean {
    const retryAt = this.failedPinRetryAt.get(cacheKey);

    return retryAt !== undefined && Date.now() < retryAt;
  }

  private rememberFailedPin(cacheKey: string): void {
    this.failedPinRetryAt.set(
      cacheKey,
      Date.now() + HeliaPinningStrategy.FAILED_PIN_RETRY_INTERVAL_MS,
    );
  }

  private forgetFailedPin(cacheKey: string): void {
    this.failedPinRetryAt.delete(cacheKey);
  }

  private errorMessage(error: unknown): string {
    return String(error);
  }

  private async ensurePinnedNow(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    cacheKey: string,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      if (await heliaCore.pins.isPinned(cid, { signal })) {
        this.locallyPinnedCids.add(cacheKey);
        this.forgetFailedPin(cacheKey);

        return;
      }

      await this.consumePinOperation(
        heliaCore.pins.add(cid, {
          metadata: {
            strategy: 'read-through-cache',
          },
          signal,
        }),
      );

      this.locallyPinnedCids.add(cacheKey);
      this.forgetFailedPin(cacheKey);
      this.debug(`Pinned IPFS content for local availability: ${cid}`);
    } catch (error) {
      this.rememberFailedPin(cacheKey);
      this.debug(
        `Skipped IPFS content pinning for local availability: ${cid}` +
          ` error=${this.errorMessage(error)}`,
      );
    }
  }

  public async ensurePinned(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    const cacheKey = this.cacheKey(cid);

    if (
      this.locallyPinnedCids.has(cacheKey) ||
      this.shouldSkipFailedPin(cacheKey)
    ) {
      return;
    }

    const currentOperation = this.pinningOperations.get(cacheKey);

    if (currentOperation) {
      return currentOperation;
    }

    const operation = this.ensurePinnedNow(heliaCore, cid, cacheKey, signal);

    this.pinningOperations.set(cacheKey, operation);
    await operation.finally(() => {
      if (this.pinningOperations.get(cacheKey) === operation) {
        this.pinningOperations.delete(cacheKey);
      }
    });
  }

  public async ensureUnpinned(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    const cacheKey = this.cacheKey(cid);

    try {
      if (!(await heliaCore.pins.isPinned(cid, { signal }))) {
        this.locallyPinnedCids.delete(cacheKey);
        this.forgetFailedPin(cacheKey);

        return;
      }

      await this.consumePinOperation(heliaCore.pins.rm(cid, { signal }));

      this.locallyPinnedCids.delete(cacheKey);
      this.forgetFailedPin(cacheKey);
      this.debug(`Unpinned IPFS content before local removal: ${cid}`);
    } catch (error) {
      this.debug(
        `Skipped IPFS content unpinning before local removal: ${cid}` +
          ` error=${this.errorMessage(error)}`,
      );
    }
  }
}
