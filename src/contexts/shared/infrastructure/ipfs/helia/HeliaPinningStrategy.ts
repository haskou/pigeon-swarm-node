import Kernel from '@app/Kernel';

import { HeliaInstance, ParsedCidLike } from './adapters/HeliaRuntimeAdapter';

export default class HeliaPinningStrategy {
  private readonly locallyPinnedCids = new Set<string>();

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

  public async ensurePinned(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    const cacheKey = this.cacheKey(cid);

    if (this.locallyPinnedCids.has(cacheKey)) {
      return;
    }

    try {
      if (await heliaCore.pins.isPinned(cid, { signal })) {
        this.locallyPinnedCids.add(cacheKey);

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
      this.debug(`Pinned IPFS content for local availability: ${cid}`);
    } catch {
      this.debug(`Skipped IPFS content pinning for local availability: ${cid}`);
    }
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
    } catch {
      this.debug(`Skipped IPFS content unpinning before local removal: ${cid}`);
    }
  }
}
