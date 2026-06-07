jest.mock(
  '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter',
  () => ({
    __esModule: true,
    default: {
      peerIdFromPrivateKey: jest.fn(() => '12D3Relay'),
      peerIdFromPublicKey: jest.fn(() => '12D3Relay'),
      publicKeyFromProtobuf: jest.fn(async () => ({
        verify: jest.fn(async (message: Uint8Array, signature: Uint8Array) =>
          Buffer.from(message).equals(Buffer.from(signature)),
        ),
      })),
      publicKeyToProtobuf: jest.fn(async () => Buffer.from('relay-public-key')),
    },
  }),
);

import { Libp2pPrivateKeyLike } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { PublicRelayRecordPayload } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordPayload';
import { PublicRelayRecordSigner } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordSigner';

describe('PublicRelayRecordSigner', () => {
  const signer = new PublicRelayRecordSigner();
  const payload: Omit<PublicRelayRecordPayload, 'publicKey'> = {
    expiresAt: 2000,
    issuedAt: 1000,
    multiaddrs: [
      '/dns4/relay-b.test/tcp/4011/p2p/12D3Relay',
      '/dns4/relay-a.test/tcp/4011/p2p/12D3Relay',
    ],
    peerId: 'untrusted-peer-id',
    role: 'relay',
    version: 1,
  };
  const privateKey = {
    publicKey: {},
    sign: jest.fn(async (message: Uint8Array) => message),
  } as unknown as Libp2pPrivateKeyLike;

  it('should sign a canonical relay record without private metadata', async () => {
    const record = await signer.sign(payload, privateKey);
    const primitives = record.toPrimitives();

    expect(primitives).toEqual({
      ...payload,
      peerId: '12D3Relay',
      publicKey: Buffer.from('relay-public-key').toString('base64url'),
      signature: expect.any(String),
    });
    expect(JSON.stringify(primitives)).not.toContain('owner');
    expect(JSON.stringify(primitives)).not.toContain('networkId');
    expect(JSON.stringify(primitives)).not.toContain('privateKey');
  });

  it('should verify the generated relay record signature', async () => {
    const record = await signer.sign(payload, privateKey);
    const primitives = record.toPrimitives();

    await expect(
      signer.verify(primitives, primitives.signature, 1500),
    ).resolves.toBe(true);
  });

  it('should reject expired relay records', async () => {
    const record = await signer.sign(payload, privateKey);
    const primitives = record.toPrimitives();

    await expect(
      signer.verify(primitives, primitives.signature, 2500),
    ).resolves.toBe(false);
  });
});
