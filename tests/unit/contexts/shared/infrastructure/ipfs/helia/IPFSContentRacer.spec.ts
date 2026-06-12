import { mock } from 'jest-mock-extended';

import { IPFSContentNotFoundError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import IPFSContentRacer from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer';
import { IPFSId } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function restoreTimeout(previousTimeout: string | undefined): void {
  if (previousTimeout === undefined) {
    delete process.env.IPFS_CONTENT_TIMEOUT_MS;

    return;
  }

  process.env.IPFS_CONTENT_TIMEOUT_MS = previousTimeout;
}

describe('IPFSContentRacer', () => {
  let racer: IPFSContentRacer;

  beforeEach(() => {
    racer = new IPFSContentRacer();
  });

  describe('raceGetJSON', () => {
    it('should return the first resolved JSON from any network', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const expected = { name: 'test' };
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.getJSON.mockResolvedValue(expected);
      network2.getJSON.mockRejectedValue(new Error('timeout'));

      const result = await racer.raceGetJSON([network1, network2], cid);

      expect(result).toEqual(expected);
    });

    it('should throw IPFSContentNotFoundError when all networks fail', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();

      network.getJSON.mockRejectedValue(new Error('not found'));

      await expect(racer.raceGetJSON([network], cid)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
    });

    it('should enforce a hard timeout when a network ignores abort', async () => {
      const previousTimeout = process.env.IPFS_CONTENT_TIMEOUT_MS;
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();

      process.env.IPFS_CONTENT_TIMEOUT_MS = '1';
      network.getJSON.mockReturnValue(never());

      try {
        const timeoutRacer = new IPFSContentRacer();

        await expect(timeoutRacer.raceGetJSON([network], cid)).rejects.toThrow(
          IPFSContentNotFoundError,
        );
      } finally {
        restoreTimeout(previousTimeout);
      }
    });
  });

  describe('raceGetRecord', () => {
    it('should return the first resolved record value', async () => {
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.getRecord.mockResolvedValue('cid-value');
      network2.getRecord.mockResolvedValue(undefined);

      const result = await racer.raceGetRecord([network1, network2], 'my-key');

      expect(result).toBe('cid-value');
    });

    it('should return undefined when all networks return undefined', async () => {
      const network = mock<IPFSNetwork>();

      network.getRecord.mockResolvedValue(undefined);

      const result = await racer.raceGetRecord([network], 'my-key');

      expect(result).toBeUndefined();
    });
  });

  describe('raceGetRecordCandidates', () => {
    it('should collect unique resolved record values', async () => {
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();
      const network3 = mock<IPFSNetwork>();

      network1.getRecord.mockResolvedValue('cid-a');
      network2.getRecord.mockResolvedValue('cid-a');
      network3.getRecord.mockResolvedValue('cid-b');

      const result = await racer.raceGetRecordCandidates(
        [network1, network2, network3],
        'my-key',
      );

      expect(result).toEqual(['cid-a', 'cid-b']);
      expect(network1.getRecord).toHaveBeenCalledWith(
        'my-key',
        expect.any(AbortSignal),
      );
    });

    it('should ignore missing and failed record lookups', async () => {
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();
      const network3 = mock<IPFSNetwork>();

      network1.getRecord.mockResolvedValue(undefined);
      network2.getRecord.mockRejectedValue(new Error('timeout'));
      network3.getRecord.mockResolvedValue('cid-b');

      const result = await racer.raceGetRecordCandidates(
        [network1, network2, network3],
        'my-key',
      );

      expect(result).toEqual(['cid-b']);
    });

    it('should return no candidates when record lookups ignore abort', async () => {
      const previousTimeout = process.env.IPFS_CONTENT_TIMEOUT_MS;
      const network = mock<IPFSNetwork>();

      process.env.IPFS_CONTENT_TIMEOUT_MS = '1';
      network.getRecord.mockReturnValue(never());

      try {
        const timeoutRacer = new IPFSContentRacer();
        const result = await timeoutRacer.raceGetRecordCandidates(
          [network],
          'my-key',
        );

        expect(result).toEqual([]);
      } finally {
        restoreTimeout(previousTimeout);
      }
    });
  });

  describe('raceStat', () => {
    it('should resolve when any network stat succeeds and pass signal', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.stat.mockResolvedValue(undefined);
      network2.stat.mockRejectedValue(new Error('not found'));

      await expect(racer.raceStat([network1, network2], cid)).resolves.toBe(
        undefined,
      );

      expect(network1.stat).toHaveBeenCalledWith(
        cid,
        false,
        expect.any(AbortSignal),
      );
    });

    it('should throw IPFSContentNotFoundError when all stat calls fail', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();

      network.stat.mockRejectedValue(new Error('not found'));

      await expect(racer.raceStat([network], cid)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
    });
  });
});
