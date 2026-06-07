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

      network.getJSON.mockRejectedValue(new Error('not found'));
      fallback.getJSON.mockResolvedValue(expected);

      const result = await racer.raceGetJSON([network], cid);

      expect(result).toEqual(expected);
      expect(fallback.getJSON).toHaveBeenCalledWith(
        [network],
        cid,
        expect.any(AbortSignal),
      );
      expect(fallback.getJSON.mock.calls[0][2]?.aborted).toBe(false);
    });

    it('should use a fresh signal when direct JSON lookup was aborted', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();
      const expected = { name: 'fallback' };

      racer = new IPFSContentRacer(1, fallback);
      network.getJSON.mockImplementation(
        (_ipfsId: IPFSId, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      );
      fallback.getJSON.mockResolvedValue(expected);

      const result = await racer.raceGetJSON([network], cid);

      expect(result).toEqual(expected);
      expect(fallback.getJSON.mock.calls[0][2]?.aborted).toBe(false);
    });
  });

  describe('raceGetBytes', () => {
    it('should use public fallback when direct bytes lookup fails', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();
      const expected = Buffer.from('fallback-bytes');

      network.getBytes.mockRejectedValue(new Error('not found'));
      fallback.getBytes.mockResolvedValue(expected);

      const result = await racer.raceGetBytes([network], cid);

      expect(result).toEqual(expected);
      expect(fallback.getBytes).toHaveBeenCalledWith(
        [network],
        cid,
        expect.any(AbortSignal),
      );
      expect(fallback.getBytes.mock.calls[0][2]?.aborted).toBe(false);
    });

    it('should use a fresh signal when direct bytes lookup was aborted', async () => {
      const cid = new IPFSId('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3');
      const network = mock<IPFSNetwork>();
      const expected = Buffer.from('fallback-bytes');

      racer = new IPFSContentRacer(1, fallback);
      network.getBytes.mockImplementation(
        (_ipfsId: IPFSId, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      );
      fallback.getBytes.mockResolvedValue(expected);

      const result = await racer.raceGetBytes([network], cid);

      expect(result).toEqual(expected);
      expect(fallback.getBytes.mock.calls[0][2]?.aborted).toBe(false);
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
