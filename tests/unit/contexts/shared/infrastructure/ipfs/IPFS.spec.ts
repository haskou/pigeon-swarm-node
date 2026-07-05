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

      racer.raceStat.mockResolvedValue(undefined);

      const exists = await ipfs.stat(cid);

      expect(exists).toBe(true);
      expect(racer.raceStat).toHaveBeenCalledWith([mockNetwork], cid);
    });

    it('should return false when CID does not exist', async () => {
      const cid = new IPFSId('bafymissing');

      racer.raceStat.mockRejectedValue(new IPFSContentNotFoundError('cid'));

      const exists = await ipfs.stat(cid);

      expect(exists).toBe(false);
    });

    it('should check only provided network ids when networkIds are provided', async () => {
      const cid = new IPFSId('bafy-network');
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();

      firstNetwork.getId.mockReturnValue('network-1');
      secondNetwork.getId.mockReturnValue('network-2');
      registry.getAll.mockReturnValue([firstNetwork, secondNetwork]);
      racer.raceStat.mockResolvedValue(undefined);

      const exists = await ipfs.stat(cid, false, ['network-2']);

      expect(exists).toBe(true);
      expect(registry.initialize).toHaveBeenCalled();
      expect(racer.raceStat).toHaveBeenCalledWith([secondNetwork], cid);
    });

    it('should check sequentially when offlineOnly is enabled', async () => {
      const cid = new IPFSId('bafy-offline');
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();

      registry.getAll.mockReturnValue([firstNetwork, secondNetwork]);
      firstNetwork.stat.mockRejectedValue(
        new IPFSContentNotFoundError('bafy-offline'),
      );
      secondNetwork.stat.mockResolvedValue(undefined);

      const exists = await ipfs.stat(cid, true);

      expect(exists).toBe(true);
      expect(registry.initialize).toHaveBeenCalled();
      expect(firstNetwork.stat).toHaveBeenCalledWith(cid, true);
      expect(secondNetwork.stat).toHaveBeenCalledWith(cid, true);
      expect(racer.raceStat).not.toHaveBeenCalled();
    });

    it('should check sequentially when offlineOnly is enabled with networkIds', async () => {
      const cid = new IPFSId('bafy-offline-filtered');
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();

      firstNetwork.getId.mockReturnValue('network-1');
      secondNetwork.getId.mockReturnValue('network-2');
      registry.getAll.mockReturnValue([firstNetwork, secondNetwork]);
      secondNetwork.stat.mockResolvedValue(undefined);

      const exists = await ipfs.stat(cid, true, ['network-2']);

      expect(exists).toBe(true);
      expect(secondNetwork.stat).toHaveBeenCalledWith(cid, true);
      expect(firstNetwork.stat).not.toHaveBeenCalled();
      expect(racer.raceStat).not.toHaveBeenCalled();
    });

    it('should throw when provided network ids do not match any network', async () => {
      const cid = new IPFSId('bafy-offline');

      mockNetwork.getId.mockReturnValue('existing-network');

      await expect(ipfs.stat(cid, false, ['missing-network'])).rejects.toThrow(
        IPFSNetworksNotFoundByIdsError,
      );
    });
  });

  describe('getJSONFromNetwork', () => {
    it('should get JSON from a specific network', async () => {
      const cid = new IPFSId('bafytest');
      const expected = { data: 'specific' };

      mockNetwork.getJSON.mockResolvedValue(expected);

      const result = await ipfs.getJSONFromNetwork(
        cid,
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(registry.find).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getJSONFromNetworks', () => {
    it('should race JSON retrieval across selected networks', async () => {
      const cid = new IPFSId('bafyselectedjson');
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();
      const expected = { data: 'selected' };

      firstNetwork.getId.mockReturnValue('network-1');
      secondNetwork.getId.mockReturnValue('network-2');
      registry.getAll.mockReturnValue([firstNetwork, secondNetwork]);
      racer.raceGetJSON.mockResolvedValue(expected);

      const result = await ipfs.getJSONFromNetworks(cid, ['network-2']);

      expect(result).toEqual(expected);
      expect(racer.raceGetJSON).toHaveBeenCalledWith([secondNetwork], cid);
    });
  });

  describe('getBytesFromNetworks', () => {
    it('should race byte retrieval across selected networks', async () => {
      const cid = new IPFSId('bafyselectedbytes');
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();
      const expected = Buffer.from('selected');

      firstNetwork.getId.mockReturnValue('network-1');
      secondNetwork.getId.mockReturnValue('network-2');
      registry.getAll.mockReturnValue([firstNetwork, secondNetwork]);
      racer.raceGetBytes.mockResolvedValue(expected);

      const result = await ipfs.getBytesFromNetworks(cid, ['network-2']);

      expect(result).toEqual(expected);
      expect(racer.raceGetBytes).toHaveBeenCalledWith([secondNetwork], cid);
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

  describe('getRecordCandidates', () => {
    it('should collect unique records from all networks', async () => {
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();
      const thirdNetwork = mock<IPFSNetwork>();

      registry.getAll.mockReturnValue([
        firstNetwork,
        secondNetwork,
        thirdNetwork,
      ]);
      racer.raceGetRecordCandidates.mockResolvedValue(['cid-a', 'cid-b']);

      const result = await ipfs.getRecordCandidates('my-key');

      expect(racer.raceGetRecordCandidates).toHaveBeenCalledWith(
        [firstNetwork, secondNetwork, thirdNetwork],
        'my-key',
      );
      expect(result).toEqual(['cid-a', 'cid-b']);
    });

    it('should skip networks without a record', async () => {
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();

      registry.getAll.mockReturnValue([firstNetwork, secondNetwork]);
      racer.raceGetRecordCandidates.mockResolvedValue(['cid-b']);

      const result = await ipfs.getRecordCandidates('my-key');

      expect(racer.raceGetRecordCandidates).toHaveBeenCalledWith(
        [firstNetwork, secondNetwork],
        'my-key',
      );
      expect(result).toEqual(['cid-b']);
    });
  });

  describe('getRecordFromNetwork', () => {
    it('should get record from a specific network by network id', async () => {
      mockNetwork.getRecord.mockResolvedValue('cid-value');

      const result = await ipfs.getRecordFromNetwork(
        'my-key',
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(mockNetwork.getRecord).toHaveBeenCalledWith('my-key');
      expect(result).toBe('cid-value');
    });

    it('should throw when network id is not found', async () => {
      mockNetwork.getId.mockReturnValue('another-network');

      await expect(
        ipfs.getRecordFromNetwork('my-key', 'missing-network'),
      ).rejects.toThrow(IPFSNetworksNotFoundByIdsError);
    });
  });

  describe('findConnectedNetworkIds', () => {
    it('should return only requested network ids with connected peers', async () => {
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();
      const thirdNetwork = mock<IPFSNetwork>();

      firstNetwork.getId.mockReturnValue('network-1');
      firstNetwork.getPeers.mockReturnValue(['peer-1']);
      secondNetwork.getId.mockReturnValue('network-2');
      secondNetwork.getPeers.mockReturnValue([]);
      thirdNetwork.getId.mockReturnValue('network-3');
      thirdNetwork.getPeers.mockReturnValue(['peer-3']);
      registry.getAll.mockReturnValue([
        firstNetwork,
        secondNetwork,
        thirdNetwork,
      ]);

      const connectedNetworkIds = await ipfs.findConnectedNetworkIds([
        'network-1',
        'network-1',
        'network-2',
        'missing-network',
      ]);

      expect(connectedNetworkIds).toEqual(['network-1']);
    });

    it('should wait for peers before returning connected network ids when requested', async () => {
      const network = mock<IPFSNetwork>();

      network.getId.mockReturnValue('network-1');
      network.getPeers.mockReturnValueOnce([]).mockReturnValue(['peer-1']);
      network.waitForPeers.mockResolvedValue(true);
      registry.getAll.mockReturnValue([network]);

      const connectedNetworkIds = await ipfs.findConnectedNetworkIds(
        ['network-1'],
        15_000,
      );

      expect(network.waitForPeers).toHaveBeenCalledWith(15_000);
      expect(connectedNetworkIds).toEqual(['network-1']);
    });
  });

  describe('addJSON', () => {
    it('should add JSON to a specific network', async () => {
      const expectedCid = new IPFSId('bafyresult');

      mockNetwork.addJSON.mockResolvedValue(expectedCid);

      const result = await ipfs.addJSON(
        { test: true },
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(registry.find).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
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

  describe('addBytesToNetworksReturningFirst', () => {
    it('should return the first successful add from the selected networks', async () => {
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();
      const excludedNetwork = mock<IPFSNetwork>();
      const expectedCid = new IPFSId('bafybytes');
      const bytes = new Uint8Array([1, 2, 3]);

      firstNetwork.getId.mockReturnValue('network-1');
      secondNetwork.getId.mockReturnValue('network-2');
      excludedNetwork.getId.mockReturnValue('network-3');
      firstNetwork.addBytes.mockRejectedValue(new Error('network failed'));
      secondNetwork.addBytes.mockResolvedValue(expectedCid);
      excludedNetwork.addBytes.mockResolvedValue(new IPFSId('bafywrong'));
      registry.getAll.mockReturnValue([
        firstNetwork,
        secondNetwork,
        excludedNetwork,
      ]);

      const result = await ipfs.addBytesToNetworksReturningFirst(bytes, [
        'network-1',
        'network-2',
      ]);

      expect({
        cid: result.cid,
        networkId: result.networkId,
      }).toEqual({
        cid: expectedCid,
        networkId: 'network-2',
      });
      await expect(result.completedNetworkIds).resolves.toEqual(['network-2']);
      expect(firstNetwork.addBytes).toHaveBeenCalledWith(bytes);
      expect(secondNetwork.addBytes).toHaveBeenCalledWith(bytes);
      expect(excludedNetwork.addBytes).not.toHaveBeenCalled();
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
      await ipfs.putRecord(
        'key',
        'value',
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(registry.find).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
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
      await ipfs.removeNetwork('550e8400-e29b-41d4-a716-446655440000');

      expect(registry.removeNetwork).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });
  });
});
