import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import { PrivateNetworkRelayRecord } from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecord';
import PrivateNetworkRelayRecordCodec from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordCodec';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import { mock } from 'jest-mock-extended';

function privateKey(): PrivateKey {
  const { privateKey: key } = generateKeyPairSync('ed25519');

  return new PrivateKey(
    key.export({ format: 'pem', type: 'pkcs8' }).toString(),
  );
}

function network(networkKey: PrivateKey): IPFSNetwork {
  return new IPFSNetwork(
    new IPFSNetworkConfig('network-1', 'private', networkKey),
    mock<IPFSConnection>(),
  );
}

describe('PrivateNetworkRelayRecordCodec', () => {
  it('should derive a deterministic lookup key from the private network key', () => {
    const networkKey = privateKey();
    const firstNetwork = network(networkKey);
    const secondNetwork = network(networkKey);

    expect(PrivateNetworkRelayRecordCodec.lookupKey(firstNetwork)).toBe(
      PrivateNetworkRelayRecordCodec.lookupKey(secondNetwork),
    );
  });

  it('should seal and open relay records with the same private network key', () => {
    const privateNetwork = network(privateKey());
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: 2,
      issuedAt: 1,
      multiaddrs: ['/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelay'],
      peerId: '12D3KooWRelay',
      role: 'relay',
      version: 1,
    };

    const envelope = PrivateNetworkRelayRecordCodec.seal(
      privateNetwork,
      relayRecord,
    );

    expect(
      PrivateNetworkRelayRecordCodec.open(privateNetwork, envelope),
    ).toEqual(relayRecord);
  });

  it('should not open relay records with another private network key', () => {
    const privateNetwork = network(privateKey());
    const otherPrivateNetwork = network(privateKey());
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: 2,
      issuedAt: 1,
      multiaddrs: ['/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelay'],
      peerId: '12D3KooWRelay',
      role: 'relay',
      version: 1,
    };
    const envelope = PrivateNetworkRelayRecordCodec.seal(
      privateNetwork,
      relayRecord,
    );

    expect(
      PrivateNetworkRelayRecordCodec.open(otherPrivateNetwork, envelope),
    ).toBeUndefined();
  });
});
