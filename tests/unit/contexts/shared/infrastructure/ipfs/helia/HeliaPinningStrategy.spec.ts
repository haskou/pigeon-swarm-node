jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: { debug: jest.fn() },
  },
}));

import Kernel from '@app/Kernel';

import {
  HeliaInstance,
  ParsedCidLike,
} from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import HeliaPinningStrategy from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/HeliaPinningStrategy';

async function* pinResults(cid: { toString(): string }) {
  yield cid;
}

describe('HeliaPinningStrategy', () => {
  const cid = { toString: () => 'bafymockcid' } as ParsedCidLike;
  let heliaCore: HeliaInstance;
  let strategy: HeliaPinningStrategy;

  beforeEach(() => {
    heliaCore = {
      pins: {
        add: jest.fn().mockReturnValue(pinResults(cid)),
        isPinned: jest.fn().mockResolvedValue(false),
      },
    } as unknown as HeliaInstance;
    strategy = new HeliaPinningStrategy();
    jest.clearAllMocks();
  });

  it('should pin unpinned content with read-through metadata', async () => {
    await strategy.ensurePinned(heliaCore, cid);

    expect(heliaCore.pins.isPinned).toHaveBeenCalledWith(cid, {
      signal: undefined,
    });
    expect(heliaCore.pins.add).toHaveBeenCalledWith(cid, {
      metadata: {
        strategy: 'read-through-cache',
      },
      signal: undefined,
    });
    expect(Kernel.logger.debug).toHaveBeenCalledWith(
      'Pinned IPFS content for local availability: bafymockcid',
    );
  });

  it('should not pin content that is already pinned', async () => {
    jest.mocked(heliaCore.pins.isPinned).mockResolvedValue(true);

    await strategy.ensurePinned(heliaCore, cid);

    expect(heliaCore.pins.add).not.toHaveBeenCalled();
  });

  it('should not fail reads when pinning fails', async () => {
    jest.mocked(heliaCore.pins.add).mockImplementation(() => {
      throw new Error('pin failed');
    });

    await expect(strategy.ensurePinned(heliaCore, cid)).resolves.toBe(
      undefined,
    );
    expect(Kernel.logger.debug).toHaveBeenCalledWith(
      'Skipped IPFS content pinning for local availability: bafymockcid',
    );
  });
});
