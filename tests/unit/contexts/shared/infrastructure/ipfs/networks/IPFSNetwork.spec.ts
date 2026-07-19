import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { IPFSBlockNotFoundOfflineError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSBlockNotFoundOfflineError';
import { IPFSBlockNotFoundPublicError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSBlockNotFoundPublicError';
import { IPFSContentNotFoundError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { IPFSConnection } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import { IPFSNetworkType } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkType';

describe('IPFSNetwork', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const networkId = '550e8400-e29b-41d4-a716-446655440000';
  const anotherNetworkId = '550e8400-e29b-41d4-a716-446655440001';

  let connection: MockProxy<IPFSConnection>;

  beforeEach(() => {
    connection = mock<IPFSConnection>();
  });

  describe('getId', () => {
    it('should return the network id from config', () => {
      const config = new IPFSNetworkConfig(networkId, 'my-network');
      const network = new IPFSNetwork(config, connection);

      expect(network.getId()).toBe(networkId);
    });
  });

  describe('getName', () => {
    it('should return the network name from config', () => {
      const config = new IPFSNetworkConfig(networkId, 'my-network');
      const network = new IPFSNetwork(config, connection);

      expect(network.getName()).toBe('my-network');
    });
  });

  describe('getType', () => {
    it('should return PRIVATE when config has a key', () => {
      const config = new IPFSNetworkConfig(
        networkId,
        'net',
        new PrivateKey(validPem),
      );
      const network = new IPFSNetwork(config, connection);

      expect(network.getType()).toBe(IPFSNetworkType.PRIVATE);
    });

    it('should return PUBLIC when config has no key', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);

      expect(network.getType()).toBe(IPFSNetworkType.PUBLIC);
    });
  });

  describe('isPrivate', () => {
    it('should return true for private networks', () => {
      const config = new IPFSNetworkConfig(
        networkId,
        'net',
        new PrivateKey(validPem),
      );
      const network = new IPFSNetwork(config, connection);

      expect(network.isPrivate()).toBe(true);
    });

    it('should return false for public networks', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);

      expect(network.isPrivate()).toBe(false);
    });
  });

  describe('getJSON', () => {
    it('should delegate to connection.getJSON', async () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const cid = new IPFSId('bafytest');
      const expected = { data: 'value' };

      connection.getJSON.mockResolvedValue(expected);

      const result = await network.getJSON(cid);

      expect(connection.getJSON).toHaveBeenCalledWith(cid, undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('stat', () => {
    it('should delegate to connection.stat with signal', async () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const cid = new IPFSId('bafytest');
      const controller = new AbortController();

      connection.stat.mockResolvedValue(undefined);

      await expect(
        network.stat(cid, true, controller.signal),
      ).resolves.toBeUndefined();
      expect(connection.stat).toHaveBeenCalledWith(
        cid,
        true,
        controller.signal,
      );
    });

    it('should map offline block not found errors to IPFSContentNotFoundError', async () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const cid = new IPFSId('bafytest');

      connection.stat.mockRejectedValue(
        new IPFSBlockNotFoundOfflineError('bafytest'),
      );

      await expect(network.stat(cid, true)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
    });

    it('should map online block not found errors to IPFSContentNotFoundError', async () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const cid = new IPFSId('bafytest');

      connection.stat.mockRejectedValue(
        new IPFSBlockNotFoundPublicError('bafytest'),
      );

      await expect(network.stat(cid, false)).rejects.toThrow(
        IPFSContentNotFoundError,
      );
    });

    it('should rethrow non not-found errors', async () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const cid = new IPFSId('bafytest');
      const error = new Error('internal error');

      connection.stat.mockRejectedValue(error);

      await expect(network.stat(cid, false)).rejects.toBe(error);
    });
  });

  describe('addJSON', () => {
    it('should delegate to connection.addJSON', async () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
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
      const config = new IPFSNetworkConfig(networkId, 'net');
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
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);

      connection.getRecord.mockResolvedValue('some-cid');

      const result = await network.getRecord('key');

      expect(connection.getRecord).toHaveBeenCalledWith('key', undefined);
      expect(result).toBe('some-cid');
    });
  });

  describe('getPeers', () => {
    it('should delegate to connection.getPeers', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);

      connection.getPeers.mockReturnValue(['peer1', 'peer2']);

      expect(network.getPeers()).toEqual(['peer1', 'peer2']);
    });
  });

  describe('onPeerConnected', () => {
    it('should delegate to connection.onPeerConnected', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const listener = jest.fn();

      network.onPeerConnected(listener);

      expect(connection.onPeerConnected).toHaveBeenCalledWith(listener);
    });
  });

  describe('onPeerDisconnected', () => {
    it('should delegate to connection.onPeerDisconnected', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const listener = jest.fn();

      network.onPeerDisconnected(listener);

      expect(connection.onPeerDisconnected).toHaveBeenCalledWith(listener);
    });
  });

  describe('getMultiaddrs', () => {
    it('should delegate to connection.getMultiaddrs', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);

      connection.getMultiaddrs.mockReturnValue(['/ip4/127.0.0.1/tcp/4001']);

      expect(network.getMultiaddrs()).toEqual(['/ip4/127.0.0.1/tcp/4001']);
    });
  });

  describe('getConnectedRelayPeerIds', () => {
    it('should return connected peers used by circuit relay addresses', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const relayPeerId = '12D3KooWConnectedRelay';

      connection.getPeers.mockReturnValue([relayPeerId, '12D3KooWDirectPeer']);
      connection.getMultiaddrs.mockReturnValue([
        `/dns4/relay.example.test/tcp/4181/p2p/${relayPeerId}/p2p-circuit/p2p/12D3KooWLocalPeer`,
        '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWDirectPeer',
      ]);

      expect(network.getConnectedRelayPeerIds()).toEqual([relayPeerId]);
    });

    it('should ignore stale circuit relay addresses without a live peer', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);

      connection.getPeers.mockReturnValue([]);
      connection.getMultiaddrs.mockReturnValue([
        '/dns4/relay.example.test/tcp/4181/p2p/12D3KooWStaleRelay/p2p-circuit',
      ]);

      expect(network.getConnectedRelayPeerIds()).toEqual([]);
    });
  });

  describe('dial', () => {
    it('should delegate to connection.dial', async () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);
      const multiaddr = '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWtestPeerId';
      const signal = new AbortController().signal;

      await network.dial(multiaddr, signal);

      expect(connection.dial).toHaveBeenCalledWith(multiaddr, signal);
    });
  });

  describe('getPeerId', () => {
    it('should delegate to connection.getPeerId', () => {
      const config = new IPFSNetworkConfig(networkId, 'net');
      const network = new IPFSNetwork(config, connection);

      connection.getPeerId.mockReturnValue('12D3KooWtestPeerId');

      expect(network.getPeerId()).toBe('12D3KooWtestPeerId');
    });
  });

  describe('toPrimitives', () => {
    it('should return config primitives', () => {
      const config = new IPFSNetworkConfig(
        anotherNetworkId,
        'my-net',
        new PrivateKey(validPem),
      );
      const network = new IPFSNetwork(config, connection);

      expect(network.toPrimitives()).toEqual({
        id: anotherNetworkId,
        key: validPem,
        name: 'my-net',
      });
    });
  });
});
