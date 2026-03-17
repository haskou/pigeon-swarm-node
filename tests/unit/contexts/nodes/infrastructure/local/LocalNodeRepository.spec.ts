import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local/mappers/LocalNodeMetadataMapper';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs/promises';
import { mock, MockProxy } from 'jest-mock-extended';

import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import LocalNodeRepository from '../../../../../../src/contexts/nodes/infrastructure/local/LocalNodeRepository';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

describe('LocalNodeRepository', () => {
  const canonicalNodeId = '8dc7e4dd-d164-4f0c-b9ed-36bc6e0c4f6a';
  const privateNetworkId = '550e8400-e29b-41d4-a716-446655440000';
  const publicNetworkId = '550e8400-e29b-41d4-a716-446655440001';

  let repository: LocalNodeRepository;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let mapper: LocalNodeMetadataMapper;

  beforeEach(() => {
    mapper = new LocalNodeMetadataMapper();
    networkRegistry = mock<IPFSNetworkRegistry>();
    repository = new LocalNodeRepository(networkRegistry, mapper);
    jest.clearAllMocks();
  });

  describe('loadLocalNode', () => {
    it('should load a node using persisted node id', async () => {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const networkKey = privateKey.export({
        format: 'pem',
        type: 'pkcs8',
      });
      const owner = publicKey.export({
        format: 'pem',
        type: 'spki',
      });
      const privateNetworkId = '550e8400-e29b-41d4-a716-446655440000';
      const publicNetworkId = '550e8400-e29b-41d4-a716-446655440001';
      const privateNetwork = mock<IPFSNetwork>();
      const publicNetwork = mock<IPFSNetwork>();

      privateNetwork.toPrimitives.mockReturnValue({
        id: privateNetworkId,
        key: networkKey.toString(),
        name: 'private_0',
      });
      publicNetwork.toPrimitives.mockReturnValue({
        id: publicNetworkId,
        key: undefined,
        name: 'public',
      });

      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          nodeId: canonicalNodeId,
          owner: owner.toString(),
        }),
      );
      networkRegistry.getAll.mockReturnValue([privateNetwork, publicNetwork]);

      const localNode = await repository.loadLocalNode();

      expect(localNode.toPrimitives()).toEqual({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId]: {
            id: privateNetworkId,
            key: networkKey.toString(),
            name: 'private_0',
          },
          [publicNetworkId]: {
            id: publicNetworkId,
            key: undefined,
            name: 'public',
          },
        },
        owner: owner.toString(),
      });
    });

    it('should create and persist a uuid node id when no metadata exists', async () => {
      networkRegistry.getAll.mockReturnValue([]);
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('not found'));

      const localNode = await repository.loadLocalNode();
      const primitives = localNode.toPrimitives();

      expect(primitives.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        './ipfs_storage/node-metadata.json',
        JSON.stringify({
          nodeId: primitives.id,
        }),
      );

      expect(primitives.networks).toEqual({});
      expect(primitives.owner).toBeUndefined();
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
        id: canonicalNodeId,
        networks: {
          [privateNetworkId]: {
            id: privateNetworkId,
            key: desiredKey.toString(),
            name: 'private_0',
          },
          [publicNetworkId]: {
            id: publicNetworkId,
            key: undefined,
            name: 'public',
          },
        },
        owner: undefined,
      });

      currentPublic.getName.mockReturnValue('public');
      currentPublic.getConfig.mockReturnValue(
        new IPFSNetworkConfig(publicNetworkId, 'public'),
      );
      obsoletePrivate.getName.mockReturnValue('private_legacy');
      obsoletePrivate.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          '550e8400-e29b-41d4-a716-446655440002',
          'private_legacy',
        ),
      );

      networkRegistry.getAll.mockReturnValue([currentPublic, obsoletePrivate]);

      await repository.saveLocalNode(node);

      expect(fs.writeFile).toHaveBeenCalledWith(
        './ipfs_storage/node-metadata.json',
        JSON.stringify({
          nodeId: canonicalNodeId,
        }),
      );

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
        id: privateNetworkId,
        key: desiredKey.toString(),
        name: 'private_0',
      });
    });

    it('should recreate a network when its private key changes', async () => {
      const { privateKey: currentPrivateKey } = generateKeyPairSync('ed25519');
      const { privateKey: desiredPrivateKey } = generateKeyPairSync('ed25519');
      const currentNetwork = mock<IPFSNetwork>();
      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId]: {
            id: privateNetworkId,
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
          privateNetworkId,
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
        id: privateNetworkId,
        key: desiredPrivateKey
          .export({ format: 'pem', type: 'pkcs8' })
          .toString(),
        name: 'private_0',
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        './ipfs_storage/node-metadata.json',
        JSON.stringify({
          nodeId: canonicalNodeId,
        }),
      );
    });

    it('should do nothing when helia is already synchronized with node networks', async () => {
      const { privateKey } = generateKeyPairSync('ed25519');
      const privateKeyPem = privateKey.export({
        format: 'pem',
        type: 'pkcs8',
      });
      const currentNetwork = mock<IPFSNetwork>();
      const node = Node.fromPrimitives({
        id: canonicalNodeId,
        networks: {
          [privateNetworkId]: {
            id: privateNetworkId,
            key: privateKeyPem.toString(),
            name: 'private_0',
          },
        },
        owner: undefined,
      });

      currentNetwork.getName.mockReturnValue('private_0');
      currentNetwork.getConfig.mockReturnValue(
        new IPFSNetworkConfig(
          privateNetworkId,
          'private_0',
          new PrivateKey(privateKeyPem.toString()),
        ),
      );

      networkRegistry.getAll.mockReturnValue([currentNetwork]);

      await repository.saveLocalNode(node);

      expect(networkRegistry.removeNetwork).not.toHaveBeenCalled();
      expect(networkRegistry.register).not.toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        './ipfs_storage/node-metadata.json',
        JSON.stringify({
          nodeId: canonicalNodeId,
        }),
      );
    });
  });
});
