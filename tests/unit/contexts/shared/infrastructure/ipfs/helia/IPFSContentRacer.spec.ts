jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: {
      warn: jest.fn(),
    },
  },
}));

import Kernel from '@app/Kernel';
import { mock } from 'jest-mock-extended';

import { IPFSContentNotFoundError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { PublicIPFSContentFallback } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/fallback/PublicIPFSContentFallback';
import IPFSContentRacer from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer';
import { IPFSId } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';

describe('IPFSContentRacer', () => {
  let racer: IPFSContentRacer;
  let fallback: jest.Mocked<PublicIPFSContentFallback>;

  beforeEach(() => {
    jest.clearAllMocks();
    fallback = mock<PublicIPFSContentFallback>();
    fallback.getJSON.mockRejectedValue(new IPFSContentNotFoundError('cid'));
    fallback.getBytes.mockRejectedValue(new IPFSContentNotFoundError('cid'));
    racer = new IPFSContentRacer(undefined, fallback);
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

    it('should use public fallback when direct JSON lookup fails', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();
      const expected = { name: 'fallback' };
      let fallbackSignalWasAborted = true;

      network.getJSON.mockRejectedValue(new Error('not found'));
      fallback.getJSON.mockImplementation(
        async (_networks, _cid, signal?: AbortSignal) => {
          fallbackSignalWasAborted = Boolean(signal?.aborted);

          return expected;
        },
      );

      const result = await racer.raceGetJSON([network], cid);

      expect(result).toEqual(expected);
      expect(Kernel.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('through content fallback'),
      );
      expect(fallback.getJSON).toHaveBeenCalledWith(
        [network],
        cid,
        expect.any(AbortSignal),
      );
      expect(fallbackSignalWasAborted).toBe(false);
    });

    it('should use a fresh signal when direct JSON lookup was aborted', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();
      const expected = { name: 'fallback' };
      let fallbackSignalWasAborted = true;

      racer = new IPFSContentRacer(1, fallback);
      network.getJSON.mockImplementation(
        (_ipfsId: IPFSId, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      );
      fallback.getJSON.mockImplementation(
        async (_networks, _cid, signal?: AbortSignal) => {
          fallbackSignalWasAborted = Boolean(signal?.aborted);

          return expected;
        },
      );

      const result = await racer.raceGetJSON([network], cid);

      expect(result).toEqual(expected);
      expect(fallbackSignalWasAborted).toBe(false);
    });
  });

  describe('raceGetBytes', () => {
    it('should use public fallback when direct bytes lookup fails', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();
      const expected = Buffer.from('fallback-bytes');
      let fallbackSignalWasAborted = true;

      network.getBytes.mockRejectedValue(new Error('not found'));
      fallback.getBytes.mockImplementation(
        async (_networks, _cid, signal?: AbortSignal) => {
          fallbackSignalWasAborted = Boolean(signal?.aborted);

          return expected;
        },
      );

      const result = await racer.raceGetBytes([network], cid);

      expect(result).toEqual(expected);
      expect(Kernel.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('through content fallback'),
      );
      expect(fallback.getBytes).toHaveBeenCalledWith(
        [network],
        cid,
        expect.any(AbortSignal),
      );
      expect(fallbackSignalWasAborted).toBe(false);
    });

    it('should use a fresh signal when direct bytes lookup was aborted', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();
      const expected = Buffer.from('fallback-bytes');
      let fallbackSignalWasAborted = true;

      racer = new IPFSContentRacer(1, fallback);
      network.getBytes.mockImplementation(
        (_ipfsId: IPFSId, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      );
      fallback.getBytes.mockImplementation(
        async (_networks, _cid, signal?: AbortSignal) => {
          fallbackSignalWasAborted = Boolean(signal?.aborted);

          return expected;
        },
      );

      const result = await racer.raceGetBytes([network], cid);

      expect(result).toEqual(expected);
      expect(fallbackSignalWasAborted).toBe(false);
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
