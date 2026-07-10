import Kernel from '@haskou/ddd-kernel';

import { HeliaInstance, ParsedCidLike } from './adapters/HeliaRuntimeAdapter';

export default class HeliaPinningStrategy {
  private static readonly RETENTION_STRATEGY = 'retained-content';

  private readonly locallyPinnedCids = new Set<string>();

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

        return;
      }

      await this.consumePinOperation(
        heliaCore.pins.add(cid, {
          metadata: {
            strategy: HeliaPinningStrategy.RETENTION_STRATEGY,
          },
          signal,
        }),
      );

      this.locallyPinnedCids.add(cacheKey);
      this.debug(`Pinned IPFS content for local availability: ${cid}`);
    } catch (error) {
      this.debug(
        `Skipped IPFS content pinning for local availability: ${cid}` +
          ` error=${this.errorMessage(error)}`,
      );

      throw error;
    }
  }

  public async ensurePinned(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    const cacheKey = this.cacheKey(cid);

    if (this.locallyPinnedCids.has(cacheKey)) {
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

        return;
      }

      await this.consumePinOperation(heliaCore.pins.rm(cid, { signal }));

      this.locallyPinnedCids.delete(cacheKey);
      this.debug(`Unpinned IPFS content before local removal: ${cid}`);
    } catch (error) {
      this.debug(
        `Skipped IPFS content unpinning before local removal: ${cid}` +
          ` error=${this.errorMessage(error)}`,
      );
    }
  }
}
