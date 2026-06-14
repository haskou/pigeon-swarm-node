import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import Kernel from '@app/Kernel';
import PrivateNetworkRelayRecordDirectory from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import { mock, MockProxy } from 'jest-mock-extended';

function privateKey(): PrivateKey {
  const { privateKey: key } = generateKeyPairSync('ed25519');

  return new PrivateKey(
    key.export({ format: 'pem', type: 'pkcs8' }).toString(),
  );
}

function privateNetwork(networkKey: PrivateKey): IPFSNetwork {
  const connection = mock<IPFSConnection>();

  connection.getPeerId.mockReturnValue('12D3KooWRelay');

  return new IPFSNetwork(
    new IPFSNetworkConfig('network-1', 'private', networkKey),
    connection,
  );
}

describe('PrivateNetworkRelayRecordDirectory', () => {
  let logger: MockProxy<WinstonLogger>;

  beforeEach(() => {
    delete process.env.PIGEON_PRIVATE_RELAY_RECORD_GENERIC_DHT_ENABLED;
    delete process.env.PIGEON_PRIVATE_RELAY_RECORD_PUBSUB_ENABLED;

    logger = mock<WinstonLogger>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should not fail the whole relay record publication when generic DHT aborts after pubsub publishes', async () => {
    const directory = new PrivateNetworkRelayRecordDirectory();
    const publicConnection = mock<IPFSConnection>();

    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.waitForPeers.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.putRecord.mockRejectedValue(
      new Error('PutFailedError: AbortError: This operation was aborted'),
    );
    publicConnection.publishIPNSRecord.mockResolvedValue(undefined);

    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);
    (
      directory as unknown as {
        publishRelayIPNSRecord: () => Promise<boolean>;
      }
    ).publishRelayIPNSRecord = jest.fn().mockResolvedValue(false);

    await directory.publish(
      privateNetwork(privateKey()),
      {
        announceAddresses: [
          '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
        ],
        listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
        relayDataLimitBytes: 67_108_864,
      },
      mock(),
    );

    expect(publicConnection.publishPubSub).toHaveBeenCalled();
    expect(publicConnection.putRecord).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Private IPFS relay generic DHT record publication failed',
      ),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Private IPFS relay record publication failed'),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'reason="No publication channel succeeded."',
      ),
    );
  });
});
