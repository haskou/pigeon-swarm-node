import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import PrivateNetworkRelayRecordCodec from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordCodec';
import {
  PrivateKey,
  PrivateNetworkRelayRecord,
} from '@haskou/pigeon-swarm-crypto';
import vectors from '@haskou/pigeon-swarm-crypto/vectors/private-network.json';
import { mock } from 'jest-mock-extended';

const keys = {
  network: new PrivateKey(vectors.keys.network.privateKeyPem),
  other: new PrivateKey(vectors.keys.other.privateKeyPem),
};
const record = vectors.relayRecord.record as PrivateNetworkRelayRecord;

function network(networkKey?: PrivateKey): IPFSNetwork {
  return new IPFSNetwork(
    new IPFSNetworkConfig('network-1', 'private', networkKey),
    mock<IPFSConnection>(),
  );
}

describe('PrivateNetworkRelayRecordCodec', () => {
  it('should derive the vector fingerprint and lookup key', () => {
    expect(
      PrivateNetworkRelayRecordCodec.fingerprint(network(keys.network)),
    ).toBe(vectors.derived.fingerprint);
    expect(
      PrivateNetworkRelayRecordCodec.lookupKey(network(keys.network)),
    ).toBe(vectors.derived.relayLookupKey);
    expect(PrivateNetworkRelayRecordCodec.lookupKey(network(keys.other))).toBe(
      vectors.otherDerived.relayLookupKey,
    );
  });

  it('should open the vector envelope', () => {
    expect(
      PrivateNetworkRelayRecordCodec.open(
        network(keys.network),
        vectors.relayRecord.envelope,
      ),
    ).toEqual(record);
  });

  it('should seal relay records that only the same network key opens', () => {
    const envelope = PrivateNetworkRelayRecordCodec.seal(
      network(keys.network),
      record,
    );

    expect(
      PrivateNetworkRelayRecordCodec.open(network(keys.network), envelope),
    ).toEqual(record);
    expect(
      PrivateNetworkRelayRecordCodec.open(network(keys.other), envelope),
    ).toBeUndefined();
  });

  it.each(vectors.relayRecord.invalid.map((vector) => [vector.name, vector]))(
    'should reject the %s vector',
    (_name, vector) => {
      expect(
        PrivateNetworkRelayRecordCodec.open(
          network(keys[vector.key as keyof typeof keys]),
          vector.envelope,
        ),
      ).toBeUndefined();
    },
  );

  it('should refuse a network without a private key', () => {
    expect(() => PrivateNetworkRelayRecordCodec.lookupKey(network())).toThrow(
      'cannot use private relay records without a private network key',
    );
  });
});
