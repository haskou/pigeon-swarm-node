import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import PrivateControlTransitionVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateControlTransitionVerifier';
import PrivateFreshnessVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateFreshnessVerifier';
import PrivateGenesisVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateGenesisVerifier';
import PrivateOperationVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateOperationVerifier';
import {
  PrivateControlSignature,
  PrivateFreshnessProof,
  PrivateGenesisSignature,
  PrivateOperationSignature,
} from '@haskou/pigeon-swarm-crypto';

describe('private authorization cryptography adapters', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies an operation only against the independently expected key', () => {
    const verify = jest
      .spyOn(PrivateOperationSignature, 'verify')
      .mockReturnValue('canonical-operation');

    expect(new PrivateOperationVerifier().verify('signed', 'expected-key')).toBe(
      'canonical-operation',
    );
    expect(verify).toHaveBeenCalledWith('signed', 'expected-key');
  });

  it('pins genesis to the expected owner, scope and MLS context', () => {
    const verify = jest
      .spyOn(PrivateGenesisSignature, 'verify')
      .mockReturnValue('canonical-genesis');

    expect(
      new PrivateGenesisVerifier().verify('signed', {
        mlsContextHash: 'context',
        ownerDeviceKey: 'owner',
        scopeId: 'scope',
      }),
    ).toBe('canonical-genesis');
    expect(verify).toHaveBeenCalledWith('signed', 'owner', 'scope', 'context');
  });

  it('authenticates control bytes before MLS and verifies the resulting context', () => {
    const authenticate = jest
      .spyOn(PrivateControlSignature, 'authenticate')
      .mockReturnValue('authenticated');
    const verify = jest
      .spyOn(PrivateControlSignature, 'verify')
      .mockReturnValue('verified');
    const adapter = new PrivateControlTransitionVerifier();

    expect(adapter.authenticate('binding', 'checkpoint', 'message-hash')).toBe(
      'authenticated',
    );
    expect(
      adapter.verify(
        'authenticated',
        'checkpoint',
        'message-hash',
        'context-hash',
      ),
    ).toBe('verified');
    expect(authenticate).toHaveBeenCalledWith(
      'binding',
      'checkpoint',
      'message-hash',
    );
    expect(verify).toHaveBeenCalledWith(
      'authenticated',
      'checkpoint',
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
    [PrivateOperationSignature, () => new PrivateOperationVerifier().verify('secret', 'key')],
    [
      PrivateGenesisSignature,
      () =>
        new PrivateGenesisVerifier().verify('secret', {
          mlsContextHash: 'context',
          ownerDeviceKey: 'owner',
          scopeId: 'scope',
        }),
    ],
  ])('redacts underlying cryptographic failures', (target, invoke) => {
    jest.spyOn(target, 'verify').mockImplementation(() => {
      throw new Error('secret nested parser failure');
    });

    expect(invoke).toThrow(InvalidPrivateAuthorizationError);
    try {
      invoke();
    } catch (error) {
      expect(String(error)).toBe('InvalidPrivateAuthorizationError: Invalid private authorization');
    }
  });
});
