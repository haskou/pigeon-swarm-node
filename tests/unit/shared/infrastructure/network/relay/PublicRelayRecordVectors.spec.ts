import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordSigner } from '@app/shared/infrastructure/network/relay/PublicRelayRecordSigner';
import vectors from '@haskou/pigeon-swarm-crypto/vectors/relay-records.json';
import {
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign,
} from 'node:crypto';

// Jest cannot load the ESM-only @libp2p/crypto, so the adapter is backed by
// node:crypto Ed25519 over the shared library vector key.
jest.mock(
  '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter',
  () => {
    const fixture = jest.requireActual<typeof vectors>(
      '@haskou/pigeon-swarm-crypto/vectors/relay-records.json',
    );
    const relay = fixture.keys.relay;

    return {
      __esModule: true,
      libp2pKeyAdapter: {
        peerIdFromPrivateKey: (privateKey: { publicKey: object }) =>
          privateKey.publicKey.toString(),
        peerIdFromPublicKey: (publicKey: object) => publicKey.toString(),
        publicKeyFromProtobuf: (protobuf: Uint8Array) => {
          if (Buffer.from(protobuf).toString('base64url') !== relay.publicKey) {
            return Promise.reject(new Error('Unknown relay public key'));
          }

          return Promise.resolve({ toString: () => relay.peerId });
        },
        publicKeyToProtobuf: (publicKey: { key: KeyObject }) =>
          Promise.resolve(
            Buffer.concat([
              Buffer.from([0x08, 0x01, 0x12, 0x20]),
              publicKey.key
                .export({ format: 'der', type: 'spki' })
                .subarray(12),
            ]),
          ),
      },
    };
  },
);

const record = vectors.publicRelay.record as PublicRelayRecordPrimitives;
const invalidCases = (
  vectors.publicRelay.invalid as {
    name: string;
    record: PublicRelayRecordPrimitives;
  }[]
).map((vector) => [vector.name, vector.record] as const);

describe('Public relay record vectors', () => {
  const signer = new PublicRelayRecordSigner();
  const accepts = (
    candidate: PublicRelayRecordPrimitives,
    now = vectors.verifiedAt,
  ): Promise<boolean> => signer.verify(candidate, candidate.signature, now);

  it('signs the vector record byte for byte', async () => {
    const key = createPrivateKey(vectors.keys.relay.privateKeyPem);
    const privateKey = {
      publicKey: {
        key: createPublicKey(key),
        toString: () => vectors.keys.relay.peerId,
      },
      sign: (data: Uint8Array) => Promise.resolve(sign(null, data, key)),
    } as unknown as Libp2pPrivateKeyLike;
    const signed = await signer.sign(
      {
        expiresAt: record.expiresAt,
        issuedAt: record.issuedAt,
        multiaddrs: record.multiaddrs,
        peerId: record.peerId,
        role: 'relay',
        version: 1,
      },
      privateKey,
    );

    expect(signed.toPrimitives()).toEqual(record);
  });

  it('verifies the vector record in either multiaddr order', async () => {
    await expect(accepts(record)).resolves.toBe(true);
    await expect(
      accepts({ ...record, multiaddrs: [...record.multiaddrs].reverse() }),
    ).resolves.toBe(true);
  });

  it('rejects the vector record once expired', async () => {
    await expect(accepts(record, record.expiresAt)).resolves.toBe(false);
  });

  it('rejects the vector record under another peer id', async () => {
    await expect(
      accepts({
        ...record,
        peerId: '12D3KooWCwJnHvVSzHBqJ9GyyfBV4MH8JY4eiFskb1uGvEo4njVw',
      }),
    ).resolves.toBe(false);
  });

  it.each(invalidCases)('rejects the %s vector', async (_name, candidate) => {
    await expect(accepts(candidate)).resolves.toBe(false);
  });
});
