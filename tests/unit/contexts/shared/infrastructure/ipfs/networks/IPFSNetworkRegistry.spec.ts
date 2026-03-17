import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import { mock } from 'jest-mock-extended';

jest.mock(
  '@libp2p/crypto/keys',
  () => ({
    generateKeyPair: jest.fn(),
    privateKeyFromProtobuf: jest.fn(),
    privateKeyToProtobuf: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/peer-id',
  () => ({
    peerIdFromPrivateKey: jest.fn().mockReturnValue({
      toString: () => '12D3KooWMockPeerId',
    }),
  }),
  { virtual: true },
);

jest.mock(
  '@helia/json',
  () => ({
    json: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '@multiformats/multiaddr',
  () => ({
    multiaddr: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'helia',
  () => ({
    createHelia: jest.fn(),
    libp2pDefaults: jest.fn().mockReturnValue({
      connectionEncrypters: [],
      services: {},
      streamMuxers: [],
      transports: [],
    }),
  }),
  { virtual: true },
);

jest.mock(
  'libp2p',
  () => ({
    createLibp2p: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/pnet',
  () => ({
    preSharedKey: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'blockstore-core',
  () => ({
    MemoryBlockstore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'blockstore-fs',
  () => ({
    FsBlockstore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'datastore-core',
  () => ({
    MemoryDatastore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'datastore-fs',
  () => ({
    FsDatastore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'interface-datastore/key',
  () => ({
    Key: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'multiformats/cid',
  () => ({
    CID: { parse: jest.fn() },
  }),
  { virtual: true },
);

jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  },
}));

import { IPFSPeerIdDuplicatedError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSPeerIdDuplicatedError';
import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';

describe('IPFSNetworkRegistry', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();

  beforeEach(() => {
    delete process.env.IPFS_PRIVATE_KEY;
    delete process.env.IPFS_PRIVATE_KEY_0;
    delete process.env.IPFS_PRIVATE_KEY_1;
  });

  describe('parseEnvConfigs', () => {
    it('should not auto-register public network from env', () => {
      process.env.IPFS_PRIVATE_KEY = validPem;
      const registry = new IPFSNetworkRegistry();

      const configs = (
        registry as unknown as {
          parseEnvConfigs: () => IPFSNetworkConfig[];
        }
      ).parseEnvConfigs();

      expect(configs.map((config) => config.getName())).toEqual(['private_0']);
    });
  });

  describe('register', () => {
    it('should throw when trying to register a duplicated peer id', async () => {
      const registry = new IPFSNetworkRegistry();
      const existingNetwork = mock<IPFSNetwork>();
      const duplicatedNetwork = mock<IPFSNetwork>();

      existingNetwork.getName.mockReturnValue('private_0');
      existingNetwork.getPeerId.mockReturnValue('12D3KooWDuplicatedPeerId');

      duplicatedNetwork.getName.mockReturnValue('private_1');
      duplicatedNetwork.getPeerId.mockReturnValue('12D3KooWDuplicatedPeerId');

      (
        registry as unknown as {
          networks: IPFSNetwork[];
        }
      ).networks = [existingNetwork];

      jest
        .spyOn(
          registry as unknown as {
            loadOrCreateSharedPeerPrivateKey: () => Promise<unknown>;
          },
          'loadOrCreateSharedPeerPrivateKey',
        )
        .mockResolvedValue({});

      jest
        .spyOn(
          registry as unknown as {
            createNetworkFromConfig: () => Promise<IPFSNetwork>;
          },
          'createNetworkFromConfig',
        )
        .mockResolvedValue(duplicatedNetwork);

      await expect(
        registry.register(
          new IPFSNetworkConfig('private_1', new PrivateKey(validPem)),
        ),
      ).rejects.toThrow(IPFSPeerIdDuplicatedError);
    });
  });
});
