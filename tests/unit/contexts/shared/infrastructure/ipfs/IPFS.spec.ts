import { mock, MockProxy } from 'jest-mock-extended';

import IPFS from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFS';
import IPFSContentRacer from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSContentRacer';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSId';
import { IPFSNetwork } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetworkRegistry';

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
      const config = new IPFSNetworkConfig('new-net');

      registry.register.mockResolvedValue(mockNetwork);

      const result = await ipfs.registerNetwork(config);

      expect(registry.register).toHaveBeenCalledWith(config);
      expect(result).toEqual(mockNetwork);
    });
  });
});
