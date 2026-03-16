import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/IPFSNetworkRegistry';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import LocalNodeRepository from '../../../../../../src/contexts/nodes/infrastructure/local/LocalNodeRepository';

describe('LocalNodeRepository', () => {
  const canonicalPeerId = '12D3Koo123456789ABCDEFGHJKLMNPQRSTUVWXYZab';

  let repository: LocalNodeRepository;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;

  beforeEach(() => {
    networkRegistry = mock<IPFSNetworkRegistry>();
    repository = new LocalNodeRepository(networkRegistry);
  });

  describe('loadLocalNode', () => {
    it('should load a node using canonical peer id as node id', async () => {
      const { privateKey } = generateKeyPairSync('ed25519');
      const networkKey = privateKey.export({
        format: 'pem',
        type: 'pkcs8',
      });
      const privateNetwork = mock<IPFSNetwork>();
      const publicNetwork = mock<IPFSNetwork>();

      privateNetwork.toPrimitives.mockReturnValue({
        key: networkKey.toString(),
        name: 'private_0',
      });
      publicNetwork.toPrimitives.mockReturnValue({
        key: undefined,
        name: 'public',
      });

      networkRegistry.getSharedPeerId.mockResolvedValue(canonicalPeerId);
      networkRegistry.getAll.mockReturnValue([privateNetwork, publicNetwork]);

      const localNode = await repository.loadLocalNode();

      expect(localNode.toPrimitives()).toEqual({
        id: canonicalPeerId,
        networks: {
          private_0: {
            key: networkKey.toString(),
            name: 'private_0',
          },
          public: {
            key: undefined,
            name: 'public',
          },
        },
        owner: undefined,
      });
    });

    it('should load node id from shared peer id when no networks are available', async () => {
      networkRegistry.getAll.mockReturnValue([]);
      networkRegistry.getSharedPeerId.mockResolvedValue(canonicalPeerId);

      const localNode = await repository.loadLocalNode();

      expect(localNode.toPrimitives()).toEqual({
        id: canonicalPeerId,
        networks: {},
        owner: undefined,
      });
    });
  });

  describe('saveLocalNode', () => {
    it('should register missing networks and unregister removed networks', async () => {
      const { privateKey } = generateKeyPairSync('ed25519');
      const desiredKey = privateKey.export({
        format: 'pem',
        type: 'pkcs8',
      });
      const currentPublic = mock<IPFSNetwork>();
      const obsoletePrivate = mock<IPFSNetwork>();
      const node = Node.fromPrimitives({
        id: canonicalPeerId,
        networks: {
          private_0: {
            key: desiredKey.toString(),
            name: 'private_0',
          },
          public: {
            key: undefined,
            name: 'public',
          },
        },
        owner: undefined,
      });

      currentPublic.getName.mockReturnValue('public');
      currentPublic.getConfig.mockReturnValue(new IPFSNetworkConfig('public'));
      obsoletePrivate.getName.mockReturnValue('private_legacy');
      obsoletePrivate.getConfig.mockReturnValue(
        new IPFSNetworkConfig('private_legacy'),
      );

      networkRegistry.getAll.mockReturnValue([currentPublic, obsoletePrivate]);

      await repository.saveLocalNode(node);

      expect(networkRegistry.initialize).toHaveBeenCalled();
      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith(
        'private_legacy',
      );
      expect(networkRegistry.register).toHaveBeenCalledWith(
        expect.objectContaining({
          getKey: expect.any(Function),
          getName: expect.any(Function),
        }),
      );
      expect(networkRegistry.register.mock.calls[0][0].toPrimitives()).toEqual({
        key: desiredKey.toString(),
        name: 'private_0',
      });
    });

    it('should recreate a network when its private key changes', async () => {
      const { privateKey: currentPrivateKey } = generateKeyPairSync('ed25519');
      const { privateKey: desiredPrivateKey } = generateKeyPairSync('ed25519');
      const currentNetwork = mock<IPFSNetwork>();
      const node = Node.fromPrimitives({
        id: canonicalPeerId,
        networks: {
          private_0: {
            key: desiredPrivateKey
              .export({ format: 'pem', type: 'pkcs8' })
              .toString(),
            name: 'private_0',
          },
        },
        owner: undefined,
      });

      currentNetwork.getName.mockReturnValue('private_0');
      currentNetwork.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          'private_0',
          new PrivateKey(
            currentPrivateKey
              .export({
                format: 'pem',
                type: 'pkcs8',
              })
              .toString(),
          ),
        ),
      );

      networkRegistry.getAll.mockReturnValue([currentNetwork]);

      await repository.saveLocalNode(node);

      expect(networkRegistry.removeNetwork).toHaveBeenCalledWith('private_0');
      expect(networkRegistry.register).toHaveBeenCalledTimes(1);
      expect(networkRegistry.register.mock.calls[0][0].toPrimitives()).toEqual({
        key: desiredPrivateKey
          .export({ format: 'pem', type: 'pkcs8' })
          .toString(),
        name: 'private_0',
      });
    });

    it('should do nothing when helia is already synchronized with node networks', async () => {
      const { privateKey } = generateKeyPairSync('ed25519');
      const privateKeyPem = privateKey.export({
        format: 'pem',
        type: 'pkcs8',
      });
      const currentNetwork = mock<IPFSNetwork>();
      const node = Node.fromPrimitives({
        id: canonicalPeerId,
        networks: {
          private_0: {
            key: privateKeyPem.toString(),
            name: 'private_0',
          },
        },
        owner: undefined,
      });

      currentNetwork.getName.mockReturnValue('private_0');
      currentNetwork.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          'private_0',
          new PrivateKey(privateKeyPem.toString()),
        ),
      );

      networkRegistry.getAll.mockReturnValue([currentNetwork]);

      await repository.saveLocalNode(node);

      expect(networkRegistry.removeNetwork).not.toHaveBeenCalled();
      expect(networkRegistry.register).not.toHaveBeenCalled();
    });
  });
});
