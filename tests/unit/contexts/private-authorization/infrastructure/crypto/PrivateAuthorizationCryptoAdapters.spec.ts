import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import PrivateControlTransitionVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateControlTransitionVerifier';
import PrivateFreshnessVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateFreshnessVerifier';
import PrivateGenesisVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateGenesisVerifier';
import PrivateOperationVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateOperationVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  PrivateControlSignature,
  PrivateFreshnessProof,
  PrivateGenesisSignature,
  PrivateOperationSignature,
  StateDigest,
} from '@haskou/pigeon-swarm-crypto';
import { generateKeyPairSync } from 'crypto';

import { cryptoVectors } from '../../../../../support/cryptoVectors';

const protectedStateVector = cryptoVectors<{
  bytesDigest: { valid: { bytes: string; id: string; name: string }[] };
}>('commitment-ids').bytesDigest.valid.find(
  ({ name }) => name === 'protected state bytes',
)!;

describe('private authorization cryptography adapters', () => {
  const ownerIdentityId = new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64'),
  );
  afterEach(() => jest.restoreAllMocks());

  it('verifies an operation only against the independently expected key', () => {
    const verify = jest
      .spyOn(PrivateOperationSignature, 'verify')
      .mockReturnValue('canonical-operation');

    expect(
      new PrivateOperationVerifier()
        .verify('signed', 'expected-key')
        .hasValue('canonical-operation'),
    ).toBe(true);
    expect(verify).toHaveBeenCalledWith('signed', 'expected-key');
  });

  it('pins genesis to the expected owner, scope and MLS context', () => {
    const protectedState = Buffer.from(protectedStateVector.bytes, 'hex');
    const mlsContextHash = protectedStateVector.id;
    const canonicalGenesis = JSON.stringify({
      headHash: 'head',
      mlsContextHash,
      mlsEpoch: 0,
      policy: {
        authorityKeys: ['owner'],
        devices: [{ deviceKey: 'owner', mlsCredentialHash: 'credential' }],
        freshnessAuthorityKey: 'owner',
      },
      revision: 0,
      scopeId: 'scope',
    });
    const genesisHash = StateDigest.ofBytes(
      Buffer.from(canonicalGenesis, 'utf8'),
    );
    const verify = jest
      .spyOn(PrivateGenesisSignature, 'verify')
      .mockReturnValue(canonicalGenesis);
    const digest = jest.spyOn(StateDigest, 'ofBytes');

    expect(
      new PrivateGenesisVerifier().verify(
        JSON.stringify({ mlsContextHash, scopeId: 'scope' }),
        'owner',
        protectedState.toString('base64url'),
        ownerIdentityId,
      ),
    ).toMatchObject({
      checkpoint: expect.any(Object),
      genesisHash,
    });
    expect(digest).toHaveBeenCalledWith(protectedState);
    expect(digest).toHaveBeenCalledWith(Buffer.from(canonicalGenesis, 'utf8'));
    expect(verify).toHaveBeenCalledWith(
      JSON.stringify({ mlsContextHash, scopeId: 'scope' }),
      'owner',
      'scope',
      mlsContextHash,
    );
  });

  it('authenticates control bytes before MLS and verifies the resulting context', () => {
    const authenticate = jest
      .spyOn(PrivateControlSignature, 'authenticate')
      .mockReturnValue('authenticated');
    const verify = jest
      .spyOn(PrivateControlSignature, 'verify')
      .mockReturnValue('verified');
    const adapter = new PrivateControlTransitionVerifier();

    expect(
      adapter.authenticate(
        'binding',
        'checkpoint',
        'authenticated-operation',
        'message-hash',
      ),
    ).toBe('authenticated');
    expect(
      adapter.verify(
        'authenticated',
        'checkpoint',
        'authenticated-operation',
        'message-hash',
        'context-hash',
      ),
    ).toBe('verified');
    expect(authenticate).toHaveBeenCalledWith(
      'binding',
      'checkpoint',
      'authenticated-operation',
      'message-hash',
    );
    expect(verify).toHaveBeenCalledWith(
      'authenticated',
      'checkpoint',
      'authenticated-operation',
      'message-hash',
      'context-hash',
    );
  });

  it('binds freshness to the expected signer and exact local request', () => {
    const verify = jest
      .spyOn(PrivateFreshnessProof, 'verify')
      .mockReturnValue('canonical-proof');

    expect(
      new PrivateFreshnessVerifier().verify(
        'proof',
        'expected-authority',
        'request',
      ),
    ).toBe('canonical-proof');
    expect(verify).toHaveBeenCalledWith(
      'proof',
      'expected-authority',
      'request',
    );
  });

  it.each([
    [
      PrivateOperationSignature,
      () => new PrivateOperationVerifier().verify('secret', 'key'),
    ],
    [
      PrivateGenesisSignature,
      () =>
        new PrivateGenesisVerifier().verify(
          JSON.stringify({ mlsContextHash: 'context', scopeId: 'scope' }),
          'owner',
          Buffer.from('state').toString('base64url'),
          ownerIdentityId,
        ),
    ],
  ])('redacts underlying cryptographic failures', (target, invoke) => {
    jest.spyOn(target, 'verify').mockImplementation(() => {
      throw new Error('secret nested parser failure');
    });

    expect(invoke).toThrow(InvalidPrivateAuthorizationError);
    try {
      invoke();
    } catch (error) {
      expect(String(error)).toBe(
        '[InvalidPrivateAuthorizationError]: Invalid private authorization',
      );
    }
  });
});
