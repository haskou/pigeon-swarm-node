import CallRelayRecordSigner from '@app/apps/apis/calls-api/CallRelayRecordSigner';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { InvalidCallRelayRecordError } from '@haskou/pigeon-swarm-crypto';
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
        peerIdFromPrivateKey: () => relay.peerId,
        peerIdFromPublicKey: (publicKey: object) => publicKey.toString(),
        publicKeyFromProtobuf: () =>
          Promise.resolve({ toString: () => relay.peerId }),
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

describe('CallRelayRecordSigner', () => {
  const signer = new CallRelayRecordSigner();
  const key = createPrivateKey(vectors.keys.relay.privateKeyPem);
  const privateKey = {
    publicKey: { key: createPublicKey(key) },
    sign: (data: Uint8Array) => Promise.resolve(sign(null, data, key)),
  } as unknown as Libp2pPrivateKeyLike;
  const urls = ['turn:relay.example.test:4199?transport=udp'];

  it('verifies a v2 peer announcement without a shared pool secret', async () => {
    const record = (
      await signer.sign(
        {
          expiresAt: Date.now() + 60_000,
          issuedAt: Date.now(),
          role: 'call-relay',
          urls,
          version: 2,
        },
        privateKey,
        'owner-secret',
      )
    ).toPrimitives();

    expect(record.poolSignature).toBe('');
    await expect(
      signer.verify(record, record.signature, 'different-secret'),
    ).resolves.toBe(true);
    await expect(
      signer.verify(
        { ...record, urls: ['turn:attacker.example'] },
        record.signature,
        '',
      ),
    ).resolves.toBe(false);
  });

  it.each([
    [NaN, 2000],
    [1000, Infinity],
    [-1, 2000],
    [1000.5, 2000],
    [2000, 2000],
    [3000, 2000],
  ])(
    'should refuse to sign an invalid lifetime %s to %s',
    async (issuedAt, expiresAt) => {
      await expect(
        signer.sign(
          { expiresAt, issuedAt, role: 'call-relay', urls, version: 1 },
          privateKey,
          'turn-pool-secret',
        ),
      ).rejects.toThrow(InvalidCallRelayRecordError);
    },
  );

  it('should require the TURN pool shared secret to verify relay records', async () => {
    const record = (
      await signer.sign(
        {
          expiresAt: Date.now() + 60_000,
          issuedAt: Date.now(),
          role: 'call-relay',
          urls,
          version: 1,
        },
        privateKey,
        'turn-pool-secret',
      )
    ).toPrimitives();

    await expect(
      signer.verify(record, record.signature, 'turn-pool-secret'),
    ).resolves.toBe(true);
    await expect(
      signer.verify(record, record.signature, 'other-secret'),
    ).resolves.toBe(false);
  });
});
