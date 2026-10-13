import { CallRelayRecordPrimitives } from '@app/apps/apis/calls-api/CallRelayRecordPrimitives';
import CallRelayRecordSigner from '@app/apps/apis/calls-api/CallRelayRecordSigner';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import {
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign,
  verify,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Jest cannot load the ESM-only @libp2p/crypto, so the adapter is backed by
// node:crypto Ed25519 over the fixture key. The signer under test still builds
// the canonical payload, the pool proof and the lifetime and peer id checks.
jest.mock(
  '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter',
  () => {
    const fixture = jest.requireActual<Vectors>(
      '../../../../fixtures/call-relay-record-vectors.json',
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
          const key = createPublicKey(relay.publicKeyPem);

          return Promise.resolve({
            toString: () => relay.peerId,
            verify: (data: Uint8Array, signature: Uint8Array) =>
              Promise.resolve(verify(null, data, key, signature)),
          });
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

interface Vectors {
  cases: {
    derived: {
      canonicalPayload: string;
      poolSignature: string;
      record: CallRelayRecordPrimitives;
      signature: string;
    };
    input: {
      expiresAt: number;
      issuedAt: number;
      urls: string[];
      version: 1 | 2;
    };
    name: string;
  }[];
  keys: {
    relay: {
      peerId: string;
      privateKeyPem: string;
      publicKey: string;
      publicKeyPem: string;
    };
  };
  sharedSecret: string;
  verifiedAt: number;
}

const vectors = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../fixtures/call-relay-record-vectors.json'),
    'utf8',
  ),
) as Vectors;
const cases = vectors.cases.map((vector) => [vector.name, vector] as const);
const v1 = vectors.cases.find((vector) => vector.input.version === 1)!;
const v2 = vectors.cases.find((vector) => vector.input.version === 2)!;

describe('Call relay record vectors', () => {
  const signer = new CallRelayRecordSigner();
  const accepts = (
    record: CallRelayRecordPrimitives,
    sharedSecret = vectors.sharedSecret,
    now = vectors.verifiedAt,
  ): Promise<boolean> =>
    signer.verify(record, record.signature, sharedSecret, now);

  it.each(cases)('%s is signed byte for byte', async (_name, vector) => {
    const key = createPrivateKey(vectors.keys.relay.privateKeyPem);
    const privateKey = {
      publicKey: {
        key: createPublicKey(key),
        toString: () => vectors.keys.relay.peerId,
      },
      sign: (data: Uint8Array) => Promise.resolve(sign(null, data, key)),
    } as unknown as Libp2pPrivateKeyLike;
    const record = await signer.sign(
      { ...vector.input, role: 'call-relay' },
      privateKey,
      vectors.sharedSecret,
    );

    expect(record.toPrimitives()).toEqual(vector.derived.record);
    expect(vector.derived.record.peerId).toBe(vectors.keys.relay.peerId);
    expect(vector.derived.record.publicKey).toBe(vectors.keys.relay.publicKey);
    expect(
      verify(
        null,
        Buffer.from(vector.derived.canonicalPayload),
        createPublicKey(vectors.keys.relay.publicKeyPem),
        Buffer.from(vector.derived.signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it.each(cases)('%s verifies in either url order', async (_name, vector) => {
    await expect(accepts(vector.derived.record)).resolves.toBe(true);
    await expect(
      accepts({
        ...vector.derived.record,
        urls: [...vector.input.urls].reverse(),
      }),
    ).resolves.toBe(true);
  });

  it.each(cases)('%s is rejected once expired', async (_name, vector) => {
    await expect(
      accepts(
        vector.derived.record,
        vectors.sharedSecret,
        vector.derived.record.expiresAt,
      ),
    ).resolves.toBe(false);
  });

  it.each(cases)(
    '%s is rejected with a tampered url',
    async (_name, vector) => {
      await expect(
        accepts({
          ...vector.derived.record,
          urls: ['turn:attacker.example.test:3478'],
        }),
      ).resolves.toBe(false);
    },
  );

  it.each(cases)(
    '%s is rejected under another peer id',
    async (_name, vector) => {
      await expect(
        accepts({
          ...vector.derived.record,
          peerId: '12D3KooWCallRelayImpostor',
        }),
      ).resolves.toBe(false);
    },
  );

  it('rejects a v1 record outside its relay pool', async () => {
    await expect(
      accepts(v1.derived.record, 'another-pool-secret'),
    ).resolves.toBe(false);
  });

  it('rejects a v1 record downgraded to a v2 announcement', async () => {
    await expect(
      accepts({ ...v1.derived.record, poolSignature: '', version: 2 }),
    ).resolves.toBe(false);
  });

  it('accepts a v2 announcement under any pool secret', async () => {
    await expect(accepts(v2.derived.record, '')).resolves.toBe(true);
  });

  it('rejects a v2 announcement that carries a pool signature', async () => {
    await expect(
      accepts({
        ...v2.derived.record,
        poolSignature: v1.derived.poolSignature,
      }),
    ).resolves.toBe(false);
  });
});
