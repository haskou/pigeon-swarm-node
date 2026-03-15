import { mock, MockProxy } from 'jest-mock-extended';

import { Password } from '../../../../../../src/contexts/shared/domain/value-objects/Password';
import { AbstractIPFS } from '../../../../../../src/contexts/shared/infrastructure/ipfs/AbstractIPFS';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSId';
import { IPFSNetwork } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetworkConfig';
import { IPFSNetworkType } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetworkType';

describe('IPFSNetwork', () => {
  let connection: MockProxy<AbstractIPFS>;

  beforeEach(() => {
    connection = mock<AbstractIPFS>();
  });

  describe('getName', () => {
    it('should return the network name from config', () => {
      const config = new IPFSNetworkConfig('my-network');
      const network = new IPFSNetwork(config, connection);

      expect(network.getName()).toBe('my-network');
    });
  });

  describe('getType', () => {
    it('should return PRIVATE when config has a key', () => {
      const config = new IPFSNetworkConfig(
        'net',
        new Password('secret-key-12345'),
      );
      const network = new IPFSNetwork(config, connection);

      expect(network.getType()).toBe(IPFSNetworkType.PRIVATE);
    });

    it('should return PUBLIC when config has no key', () => {
      const config = new IPFSNetworkConfig('net');
      const network = new IPFSNetwork(config, connection);

      expect(network.getType()).toBe(IPFSNetworkType.PUBLIC);
    });
  });

  describe('isPrivate', () => {
    it('should return true for private networks', () => {
      const config = new IPFSNetworkConfig(
        'net',
        new Password('secret-key-12345'),
      );
      const network = new IPFSNetwork(config, connection);

      expect(network.isPrivate()).toBe(true);
    });

    it('should return false for public networks', () => {
      const config = new IPFSNetworkConfig('net');
      const network = new IPFSNetwork(config, connection);

      expect(network.isPrivate()).toBe(false);
    });
  });

  describe('getJSON', () => {
    it('should delegate to connection.getJSON', async () => {
      const config = new IPFSNetworkConfig('net');
      const network = new IPFSNetwork(config, connection);
      const cid = new IPFSId('bafytest');
      const expected = { data: 'value' };

      connection.getJSON.mockResolvedValue(expected);

      const result = await network.getJSON(cid);

      expect(connection.getJSON).toHaveBeenCalledWith(cid, undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('addJSON', () => {
    it('should delegate to connection.addJSON', async () => {
      const config = new IPFSNetworkConfig('net');
      const network = new IPFSNetwork(config, connection);
      const data = { key: 'value' };
      const expectedCid = new IPFSId('bafyresult');

      connection.addJSON.mockResolvedValue(expectedCid);

      const result = await network.addJSON(data);

      expect(connection.addJSON).toHaveBeenCalledWith(data, undefined);
      expect(result).toEqual(expectedCid);
    });
  });

  describe('putRecord', () => {
    it('should delegate to connection.putRecord', async () => {
      const config = new IPFSNetworkConfig('net');
      const network = new IPFSNetwork(config, connection);

      await network.putRecord('key', 'value');

      expect(connection.putRecord).toHaveBeenCalledWith(
        'key',
        'value',
        undefined,
      );
    });
  });

  describe('getRecord', () => {
    it('should delegate to connection.getRecord', async () => {
      const config = new IPFSNetworkConfig('net');
      const network = new IPFSNetwork(config, connection);

      connection.getRecord.mockResolvedValue('some-cid');

      const result = await network.getRecord('key');

      expect(connection.getRecord).toHaveBeenCalledWith('key', undefined);
      expect(result).toBe('some-cid');
    });
  });

  describe('getPeers', () => {
    it('should delegate to connection.getPeers', () => {
      const config = new IPFSNetworkConfig('net');
      const network = new IPFSNetwork(config, connection);

      connection.getPeers.mockReturnValue(['peer1', 'peer2']);

      expect(network.getPeers()).toEqual(['peer1', 'peer2']);
    });
  });

  describe('toPrimitives', () => {
    it('should return config primitives', () => {
      const config = new IPFSNetworkConfig(
        'my-net',
        new Password('key-12345678'),
      );
      const network = new IPFSNetwork(config, connection);

      expect(network.toPrimitives()).toEqual({
        key: 'key-12345678',
        name: 'my-net',
      });
    });
  });
});
