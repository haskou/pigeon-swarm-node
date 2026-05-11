import Kernel from '@app/Kernel';

import { HeliaInstance, ParsedCidLike } from './adapters/HeliaRuntimeAdapter';

export default class HeliaPinningStrategy {
  public async ensurePinned(
    heliaCore: HeliaInstance,
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      if (await heliaCore.pins.isPinned(cid, { signal })) {
        return;
      }

      for await (const pinnedCid of heliaCore.pins.add(cid, {
        metadata: {
          strategy: 'read-through-cache',
        },
        signal,
      })) {
        void pinnedCid;
      }

      Kernel.logger.debug(
        `Pinned IPFS content for local availability: ${cid.toString()}`,
      );
    } catch {
      Kernel.logger.debug(
        `Skipped IPFS content pinning for local availability: ${cid.toString()}`,
      );
    }
  }
}
