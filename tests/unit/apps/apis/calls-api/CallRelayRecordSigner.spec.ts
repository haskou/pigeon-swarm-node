import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPublicKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPublicKeyLike';

const mockPublicKey = {
  toString: jest.fn(() => '12D3KooWCallRelay'),
  verify: jest.fn(async () => true),
} as unknown as Libp2pPublicKeyLike;

jest.mock(
  '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter',
  () => ({
    __esModule: true,
    libp2pKeyAdapter: {
      peerIdFromPrivateKey: jest.fn(() => '12D3KooWCallRelay'),
      peerIdFromPublicKey: jest.fn(() => '12D3KooWCallRelay'),
      publicKeyFromProtobuf: jest.fn(async () => mockPublicKey),
      publicKeyToProtobuf: jest.fn(async () => Buffer.from('public-key')),
    },
  }),
);

import CallRelayRecordSigner from '@app/apps/apis/calls-api/CallRelayRecordSigner';

describe('CallRelayRecordSigner', () => {
  it('should require the TURN pool shared secret to verify relay records', async () => {
    const signer = new CallRelayRecordSigner();
    const privateKey = {
      publicKey: mockPublicKey,
      sign: jest.fn(async () => Buffer.from('peer-signature')),
    } as unknown as Libp2pPrivateKeyLike;
    const record = await signer.sign(
      {
        expiresAt: Date.now() + 60_000,
        issuedAt: Date.now(),
        role: 'call-relay',
        urls: ['turn:relay.example.test:4199?transport=udp'],
        version: 1,
      },
      privateKey,
      'turn-pool-secret',
    );
    const primitives = record.toPrimitives();

    await expect(
      signer.verify(primitives, primitives.signature, 'turn-pool-secret'),
    ).resolves.toBe(true);
    await expect(
      signer.verify(primitives, primitives.signature, 'other-secret'),
    ).resolves.toBe(false);
  });
});
