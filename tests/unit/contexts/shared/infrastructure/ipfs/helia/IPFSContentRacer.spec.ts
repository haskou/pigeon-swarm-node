import { mock } from 'jest-mock-extended';

import { IPFSContentNotFoundError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import IPFSContentRacer from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer';
import { IPFSId } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import ReplicatedStateNotReadyError from '../../../../../../../src/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';

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

    it('should throw ReplicatedStateNotReadyError when every network fails without answering not found', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();

      network.getJSON.mockRejectedValue(new Error('transport failed'));

      await expect(racer.raceGetJSON([network], cid)).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
    });

    it('should throw IPFSContentNotFoundError when every network answers not found', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.getJSON.mockRejectedValue(
        new IPFSContentNotFoundError(cid.valueOf()),
      );
      network2.getJSON.mockRejectedValue(
        new IPFSContentNotFoundError(cid.valueOf()),
      );

      await expect(racer.raceGetJSON([network1, network2], cid)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
    });

    it('should throw IPFSContentNotFoundError when one network answers not found and the rest fail', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.getJSON.mockRejectedValue(
        new IPFSContentNotFoundError(cid.valueOf()),
      );
      network2.getJSON.mockRejectedValue(new Error('transport failed'));

      await expect(racer.raceGetJSON([network1, network2], cid)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
    });

    it('should throw ReplicatedStateNotReadyError when there are no networks', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');

      await expect(racer.raceGetJSON([], cid)).rejects.toThrow(
        ReplicatedStateNotReadyError,
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
          ReplicatedStateNotReadyError,
        );
      } finally {
        restoreTimeout(previousTimeout);
      }
    });
  });

  describe('raceGetBytes', () => {
    it('should throw ReplicatedStateNotReadyError when every network fails without answering not found', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();

      network.getBytes.mockRejectedValue(new Error('transport failed'));

      await expect(racer.raceGetBytes([network], cid)).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
    });

    it('should throw IPFSContentNotFoundError when every network answers not found', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();

      network.getBytes.mockRejectedValue(
        new IPFSContentNotFoundError(cid.valueOf()),
      );

      await expect(racer.raceGetBytes([network], cid)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
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

    it('should throw ReplicatedStateNotReadyError when a record lookup fails and the rest report no record', async () => {
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.getRecord.mockRejectedValue(new Error('transport failed'));
      network2.getRecord.mockResolvedValue(undefined);

      await expect(
        racer.raceGetRecord([network1, network2], 'my-key'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);
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

    it('should throw ReplicatedStateNotReadyError when record lookups time out before any answer', async () => {
      const previousTimeout = process.env.IPFS_CONTENT_TIMEOUT_MS;
      const network = mock<IPFSNetwork>();

      process.env.IPFS_CONTENT_TIMEOUT_MS = '1';
      network.getRecord.mockReturnValue(never());

      try {
        const timeoutRacer = new IPFSContentRacer();

        await expect(
          timeoutRacer.raceGetRecordCandidates([network], 'my-key'),
        ).rejects.toThrow(ReplicatedStateNotReadyError);
      } finally {
        restoreTimeout(previousTimeout);
      }
    });

    it('should keep candidates found before the timeout', async () => {
      const previousTimeout = process.env.IPFS_CONTENT_TIMEOUT_MS;
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      process.env.IPFS_CONTENT_TIMEOUT_MS = '1';
      network1.getRecord.mockResolvedValue('cid-a');
      network2.getRecord.mockReturnValue(never());

      try {
        const timeoutRacer = new IPFSContentRacer();
        const result = await timeoutRacer.raceGetRecordCandidates(
          [network1, network2],
          'my-key',
        );

        expect(result).toEqual(['cid-a']);
      } finally {
        restoreTimeout(previousTimeout);
      }
    });

    it('should return no candidates when every network answers without a record', async () => {
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.getRecord.mockResolvedValue(undefined);
      network2.getRecord.mockResolvedValue(undefined);

      await expect(
        racer.raceGetRecordCandidates([network1, network2], 'my-key'),
      ).resolves.toEqual([]);
    });

    it('should throw ReplicatedStateNotReadyError when every record lookup fails', async () => {
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.getRecord.mockRejectedValue(new Error('transport failed'));
      network2.getRecord.mockRejectedValue(new Error('transport failed'));

      await expect(
        racer.raceGetRecordCandidates([network1, network2], 'my-key'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);
    });

    it('should throw ReplicatedStateNotReadyError when there are no networks', async () => {
      await expect(
        racer.raceGetRecordCandidates([], 'my-key'),
      ).rejects.toThrow(ReplicatedStateNotReadyError);
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

    it('should throw ReplicatedStateNotReadyError when every stat call fails without answering not found', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();

      network.stat.mockRejectedValue(new Error('transport failed'));

      await expect(racer.raceStat([network], cid)).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
    });

    it('should throw IPFSContentNotFoundError when every stat call answers not found', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network1 = mock<IPFSNetwork>();
      const network2 = mock<IPFSNetwork>();

      network1.stat.mockRejectedValue(
        new IPFSContentNotFoundError(cid.valueOf()),
      );
      network2.stat.mockRejectedValue(
        new IPFSContentNotFoundError(cid.valueOf()),
      );

      await expect(racer.raceStat([network1, network2], cid)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
    });

    it('should throw ReplicatedStateNotReadyError when there are no networks', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');

      await expect(racer.raceStat([], cid)).rejects.toThrow(
        ReplicatedStateNotReadyError,
      );
    });
  });
});
