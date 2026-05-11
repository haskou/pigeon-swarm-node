import Kernel from '@app/Kernel';

import { HeliaInstance, ParsedCidLike } from './adapters/HeliaRuntimeAdapter';

export default class HeliaPinningStrategy {
  private async consumePinOperation(
    operation: AsyncGenerator<ParsedCidLike, void, undefined>,
  ): Promise<void> {
    for await (const cid of operation) {
      void cid;
    }
  }

  public async ensurePinned(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      if (await heliaCore.pins.isPinned(cid, { signal })) {
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

      Kernel.logger.debug(
        `Pinned IPFS content for local availability: ${cid.toString()}`,
      );
    } catch {
      Kernel.logger.debug(
        `Skipped IPFS content pinning for local availability: ${cid.toString()}`,
      );
    }
  }

  public async ensureUnpinned(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      if (!(await heliaCore.pins.isPinned(cid, { signal }))) {
        return;
      }

      await this.consumePinOperation(heliaCore.pins.rm(cid, { signal }));

      Kernel.logger.debug(
        `Unpinned IPFS content before local removal: ${cid.toString()}`,
      );
    } catch {
      Kernel.logger.debug(
        `Skipped IPFS content unpinning before local removal: ${cid.toString()}`,
      );
    }
  }
}
