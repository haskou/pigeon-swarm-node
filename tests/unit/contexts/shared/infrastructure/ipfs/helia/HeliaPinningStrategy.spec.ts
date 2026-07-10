jest.mock('@haskou/ddd-kernel', () => ({
  __esModule: true,
  default: {
    logger: { debug: jest.fn() },
  },
}));

import Kernel from '@haskou/ddd-kernel';

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
        rm: jest.fn().mockReturnValue(pinResults(cid)),
      },
    } as unknown as HeliaInstance;
    strategy = new HeliaPinningStrategy();
    jest.clearAllMocks();
  });

  it('should pin explicitly retained content with retention metadata', async () => {
    await strategy.ensurePinned(heliaCore, cid);

    expect(heliaCore.pins.isPinned).toHaveBeenCalledWith(cid, {
      signal: undefined,
    });
    expect(heliaCore.pins.add).toHaveBeenCalledWith(cid, {
      metadata: {
        strategy: 'retained-content',
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

  it('should cache successful pin checks for repeated retention', async () => {
    await strategy.ensurePinned(heliaCore, cid);
    await strategy.ensurePinned(heliaCore, cid);

    expect(heliaCore.pins.isPinned).toHaveBeenCalledTimes(1);
    expect(heliaCore.pins.add).toHaveBeenCalledTimes(1);
  });

  it('should cache already pinned content for repeated retention', async () => {
    jest.mocked(heliaCore.pins.isPinned).mockResolvedValue(true);

    await strategy.ensurePinned(heliaCore, cid);
    await strategy.ensurePinned(heliaCore, cid);

    expect(heliaCore.pins.isPinned).toHaveBeenCalledTimes(1);
    expect(heliaCore.pins.add).not.toHaveBeenCalled();
  });

  it('should fail retention when pinning fails', async () => {
    jest.mocked(heliaCore.pins.add).mockImplementation(() => {
      throw new Error('pin failed');
    });

    await expect(strategy.ensurePinned(heliaCore, cid)).rejects.toThrow(
      'pin failed',
    );
    expect(Kernel.logger.debug).toHaveBeenCalledWith(
      'Skipped IPFS content pinning for local availability: bafymockcid error=Error: pin failed',
    );
  });

  it('should retry pinning after a failure', async () => {
    jest.mocked(heliaCore.pins.add).mockImplementation(() => {
      throw new Error('pin failed');
    });

    await expect(strategy.ensurePinned(heliaCore, cid)).rejects.toThrow(
      'pin failed',
    );
    await expect(strategy.ensurePinned(heliaCore, cid)).rejects.toThrow(
      'pin failed',
    );

    expect(heliaCore.pins.isPinned).toHaveBeenCalledTimes(2);
    expect(heliaCore.pins.add).toHaveBeenCalledTimes(2);
    expect(Kernel.logger.debug).toHaveBeenCalledTimes(2);
  });

  it('should share concurrent pin attempts for the same cid', async () => {
    let resolvePinCheck: (pinned: boolean) => void = () => undefined;
    const pinCheck = new Promise<boolean>((resolve) => {
      resolvePinCheck = resolve;
    });

    jest.mocked(heliaCore.pins.isPinned).mockReturnValue(pinCheck);

    const first = strategy.ensurePinned(heliaCore, cid);
    const second = strategy.ensurePinned(heliaCore, cid);

    resolvePinCheck(false);
    await Promise.all([first, second]);

    expect(heliaCore.pins.isPinned).toHaveBeenCalledTimes(1);
    expect(heliaCore.pins.add).toHaveBeenCalledTimes(1);
  });

  it('should unpin pinned content before local removal', async () => {
    jest.mocked(heliaCore.pins.isPinned).mockResolvedValue(true);

    await strategy.ensureUnpinned(heliaCore, cid);

    expect(heliaCore.pins.rm).toHaveBeenCalledWith(cid, {
      signal: undefined,
    });
    expect(Kernel.logger.debug).toHaveBeenCalledWith(
      'Unpinned IPFS content before local removal: bafymockcid',
    );
  });

  it('should not unpin content that is not pinned', async () => {
    await strategy.ensureUnpinned(heliaCore, cid);

    expect(heliaCore.pins.rm).not.toHaveBeenCalled();
  });

  it('should not fail removals when unpinning fails', async () => {
    jest.mocked(heliaCore.pins.isPinned).mockResolvedValue(true);
    jest.mocked(heliaCore.pins.rm).mockImplementation(() => {
      throw new Error('unpin failed');
    });

    await expect(strategy.ensureUnpinned(heliaCore, cid)).resolves.toBe(
      undefined,
    );
    expect(Kernel.logger.debug).toHaveBeenCalledWith(
      'Skipped IPFS content unpinning before local removal: bafymockcid error=Error: unpin failed',
    );
  });
});
