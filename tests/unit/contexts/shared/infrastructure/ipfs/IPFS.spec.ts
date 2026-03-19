import { UUID } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { IPFSContentNotFoundError } from '../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { IPFSNetworksNotFoundByIdsError } from '../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSNetworksNotFoundByIdsError';
import IPFSContentRacer from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSNetwork } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';

describe('IPFS', () => {
  let registry: MockProxy<IPFSNetworkRegistry>;
  let racer: MockProxy<IPFSContentRacer>;
  let ipfs: IPFS;
  let mockNetwork: MockProxy<IPFSNetwork>;

  beforeEach(() => {
    registry = mock<IPFSNetworkRegistry>();
    racer = mock<IPFSContentRacer>();
    ipfs = new IPFS(registry, racer);
    mockNetwork = mock<IPFSNetwork>();

    registry.initialize.mockResolvedValue(undefined);
    registry.getAll.mockReturnValue([mockNetwork]);
    registry.find.mockReturnValue(mockNetwork);
    mockNetwork.getId.mockReturnValue('550e8400-e29b-41d4-a716-446655440000');
  });

  describe('getJSON', () => {
    it('should initialize and race across all networks', async () => {
      const cid = new IPFSId('bafytest');
      const expected = { data: 'result' };

      racer.raceGetJSON.mockResolvedValue(expected);

      const result = await ipfs.getJSON(cid);

      expect(registry.initialize).toHaveBeenCalled();
      expect(racer.raceGetJSON).toHaveBeenCalledWith([mockNetwork], cid);
      expect(result).toEqual(expected);
    });
  });

  describe('stat', () => {
    it('should return true when CID exists in any network', async () => {
      const cid = new IPFSId('bafyexists');

      racer.raceGetJSON.mockResolvedValue({ test: true });

      const exists = await ipfs.stat(cid);

      expect(exists).toBe(true);
      expect(racer.raceGetJSON).toHaveBeenCalledWith([mockNetwork], cid);
    });

    it('should return false when CID does not exist', async () => {
      const cid = new IPFSId('bafymissing');

      racer.raceGetJSON.mockRejectedValue(new IPFSContentNotFoundError('cid'));

      const exists = await ipfs.stat(cid);

      expect(exists).toBe(false);
    });

    it('should check a specific network when networkName is provided', async () => {
      const cid = new IPFSId('bafy-network');

      mockNetwork.getJSON.mockResolvedValue({ test: 'network' });

      const exists = await ipfs.stat(cid, { networkName: 'my-network' });

      expect(exists).toBe(true);
      expect(registry.initialize).toHaveBeenCalled();
      expect(registry.find).toHaveBeenCalledWith('my-network');
      expect(racer.raceGetJSON).not.toHaveBeenCalled();
    });

    it('should check sequentially when offlineOnly is enabled', async () => {
      const cid = new IPFSId('bafy-offline');
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();

      registry.getAll.mockReturnValue([firstNetwork, secondNetwork]);
      firstNetwork.getJSON.mockRejectedValue(
        new IPFSContentNotFoundError('bafy-offline'),
      );
      secondNetwork.getJSON.mockResolvedValue({ test: 'offline-hit' });

      const exists = await ipfs.stat(cid, { offlineOnly: true });

      expect(exists).toBe(true);
      expect(registry.initialize).toHaveBeenCalled();
      expect(firstNetwork.getJSON).toHaveBeenCalledWith(cid);
      expect(secondNetwork.getJSON).toHaveBeenCalledWith(cid);
      expect(racer.raceGetJSON).not.toHaveBeenCalled();
    });
  });

  describe('getJSONFromNetwork', () => {
    it('should get JSON from a specific network', async () => {
      const cid = new IPFSId('bafytest');
      const expected = { data: 'specific' };

      mockNetwork.getJSON.mockResolvedValue(expected);

      const result = await ipfs.getJSONFromNetwork(cid, 'my-network');

      expect(registry.find).toHaveBeenCalledWith('my-network');
      expect(result).toEqual(expected);
    });
  });

  describe('getRecord', () => {
    it('should race across all networks for a record', async () => {
      racer.raceGetRecord.mockResolvedValue('cid-value');

      const result = await ipfs.getRecord('my-key');

      expect(racer.raceGetRecord).toHaveBeenCalledWith([mockNetwork], 'my-key');
      expect(result).toBe('cid-value');
    });
  });

  describe('addJSON', () => {
    it('should add JSON to a specific network', async () => {
      const expectedCid = new IPFSId('bafyresult');

      mockNetwork.addJSON.mockResolvedValue(expectedCid);

      const result = await ipfs.addJSON({ test: true }, 'my-network');

      expect(registry.find).toHaveBeenCalledWith('my-network');
      expect(mockNetwork.addJSON).toHaveBeenCalledWith({ test: true });
      expect(result).toEqual(expectedCid);
    });
  });

  describe('addJSONToAll', () => {
    it('should add JSON to all networks and return first CID', async () => {
      const expectedCid = new IPFSId('bafyresult');

      mockNetwork.addJSON.mockResolvedValue(expectedCid);

      const result = await ipfs.addJSONToAll({ test: true });

      expect(mockNetwork.addJSON).toHaveBeenCalled();
      expect(result).toEqual(expectedCid);
    });
  });

  describe('addJSONToNetworks', () => {
    it('should add JSON only to selected networks and return first CID', async () => {
      const expectedCid = new IPFSId('bafyselected');

      mockNetwork.addJSON.mockResolvedValue(expectedCid);

      const result = await ipfs.addJSONToNetworks({ test: true }, [
        '550e8400-e29b-41d4-a716-446655440000',
      ]);

      expect(mockNetwork.addJSON).toHaveBeenCalledWith({ test: true });
      expect(result).toEqual(expectedCid);
    });

    it('should throw IPFSNetworksNotFoundByIdsError when no networks match', async () => {
      mockNetwork.getId.mockReturnValue('550e8400-e29b-41d4-a716-446655440002');

      await expect(
        ipfs.addJSONToNetworks({ test: true }, [
          '550e8400-e29b-41d4-a716-446655440000',
        ]),
      ).rejects.toThrow(IPFSNetworksNotFoundByIdsError);
    });
  });

  describe('putRecord', () => {
    it('should put record to a specific network', async () => {
      await ipfs.putRecord('key', 'value', 'my-network');

      expect(registry.find).toHaveBeenCalledWith('my-network');
      expect(mockNetwork.putRecord).toHaveBeenCalledWith('key', 'value');
    });
  });

  describe('putRecordToAll', () => {
    it('should put record to all networks', async () => {
      await ipfs.putRecordToAll('key', 'value');

      expect(mockNetwork.putRecord).toHaveBeenCalledWith('key', 'value');
    });
  });

  describe('registerNetwork', () => {
    it('should delegate to registry.register', async () => {
      const config = new IPFSNetworkConfig(
        UUID.generate().toString(),
        'new-net',
      );

      registry.register.mockResolvedValue(mockNetwork);

      const result = await ipfs.registerNetwork(config);

      expect(registry.register).toHaveBeenCalledWith(config);
      expect(result).toEqual(mockNetwork);
    });
  });

  describe('removeNetwork', () => {
    it('should delegate to registry.removeNetwork', async () => {
      await ipfs.removeNetwork('my-network');

      expect(registry.removeNetwork).toHaveBeenCalledWith('my-network');
    });
  });
});
