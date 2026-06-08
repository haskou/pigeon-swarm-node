import { IPFSNetwork } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import { PrivateNetworkRelayRecordAuthenticator } from '../../../../../../src/shared/infrastructure/network/relay/PrivateNetworkRelayRecordAuthenticator';
import { PublicRelayRecordPrimitives } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';

describe('PrivateNetworkRelayRecordAuthenticator', () => {
  const networkKey =
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGAjx38RTkT7ZsPCcTRgrTAWjBdk5+Pq+/a5h2dPLsw3\n-----END PRIVATE KEY-----\n';
  const otherNetworkKey =
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGAjx38RTkT7ZsPCcTRgrTAWjBdk5+Pq+/a5h2dPLsw4\n-----END PRIVATE KEY-----\n';
  const relayRecord: PublicRelayRecordPrimitives = {
    expiresAt: 2000,
    issuedAt: 1000,
    multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
    peerId: '12D3Relay',
    publicKey: 'relay-public-key',
    role: 'relay',
    signature: 'relay-signature',
    version: 1,
  };
  const authenticator = new PrivateNetworkRelayRecordAuthenticator();

  it('should derive a stable private lookup key from the network key', () => {
    const network = privateNetwork(networkKey);

    expect(authenticator.lookupKey(network)).toBe(
      authenticator.lookupKey(privateNetwork(networkKey)),
    );
    expect(authenticator.lookupKey(network)).toContain(
      'pigeon-swarm/private-relays/v1/',
    );
    expect(authenticator.lookupKey(network)).not.toContain(network.getId());
    expect(authenticator.lookupKey(network)).not.toContain(networkKey);
  });

  it('should expose a stable non-secret private network fingerprint', () => {
    const network = privateNetwork(networkKey);

    expect(authenticator.fingerprint(network)).toBe(
      authenticator.fingerprint(privateNetwork(networkKey)),
    );
    expect(authenticator.fingerprint(network)).not.toContain(networkKey);
    expect(authenticator.fingerprint(network)).not.toBe(
      authenticator.fingerprint(privateNetwork(otherNetworkKey)),
    );
  });

  it('should open envelopes sealed with the same private network key', () => {
    const network = privateNetwork(networkKey);
    const envelope = authenticator.seal(network, relayRecord);

    expect(authenticator.open(network, envelope)).toEqual(relayRecord);
  });

  it('should reject envelopes sealed with another private network key', () => {
    const envelope = authenticator.seal(privateNetwork(networkKey), relayRecord);

    expect(
      authenticator.open(privateNetwork(otherNetworkKey), envelope),
    ).toBeUndefined();
    expect(authenticator.lookupKey(privateNetwork(networkKey))).not.toBe(
      authenticator.lookupKey(privateNetwork(otherNetworkKey)),
    );
  });

  it('should not expose the relay record in the private envelope', () => {
    const envelope = authenticator.seal(
      privateNetwork(networkKey),
      relayRecord,
    );
    const serializedEnvelope = JSON.stringify(envelope);

    expect(envelope.version).toBe(2);
    expect(envelope.encryptedRelayRecord.algorithm).toBe('aes-256-gcm');
    expect(serializedEnvelope).not.toContain(relayRecord.peerId);
    expect(serializedEnvelope).not.toContain(relayRecord.publicKey);
    expect(serializedEnvelope).not.toContain(relayRecord.multiaddrs[0]);
  });

  function privateNetwork(key: string): IPFSNetwork {
    return new IPFSNetwork(
      IPFSNetworkConfig.fromPrimitives({
        id: '550e8400-e29b-41d4-a716-446655440123',
        key,
        name: 'private',
      }),
      {} as never,
    );
  }
});
