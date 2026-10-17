import { SignedRequestReplayGuard } from '@app/apps/apis/shared/SignedRequestReplayGuard';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  KeyPair,
  Signature,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';

const SIGNATURE_BYTES = 64;

const signatureOf = (index: number): Signature => {
  const bytes = Buffer.alloc(SIGNATURE_BYTES);
  bytes.writeUInt32BE(index);

  return Signature.fromBuffer(bytes);
};

describe('SignedRequestReplayGuard', () => {
  let identity: IdentityId;
  let attacker: IdentityId;

  beforeAll(async () => {
    identity = new IdentityId(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
    attacker = new IdentityId(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
  });

  it('rejects a repeated signature for the same identity', () => {
    const guard = new SignedRequestReplayGuard();

    expect(guard.accept(identity, signatureOf(0))).toBe(true);
    expect(guard.accept(identity, signatureOf(0))).toBe(false);
  });

  it('accepts the same signature for another identity', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0));

    expect(guard.accept(attacker, signatureOf(0))).toBe(true);
  });

  it('rejects a repeated signature when the same key signs as a device', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0));

    expect(
      guard.accept(DeviceCredential.fromIdentityId(identity), signatureOf(0)),
    ).toBe(false);
  });

  it.each(IdentityIdMother.aliases())(
    'rejects a repeated signature that names the key by %s',
    (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const guard = new SignedRequestReplayGuard();

      guard.accept(identity, signatureOf(0));

      expect(guard.accept(aliasOf(identity), signatureOf(0))).toBe(false);
    },
  );

  it.each(IdentityIdMother.aliases())(
    'rejects a signer named by %s even on its first signature',
    (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const guard = new SignedRequestReplayGuard();

      expect(guard.accept(aliasOf(identity), signatureOf(0))).toBe(false);
    },
  );

  it('keeps live entries and fails closed at capacity instead of evicting them', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0));
    Array.from({ length: 100_000 }).forEach((_, index) =>
      guard.accept(attacker, signatureOf(index + 1)),
    );

    expect(guard.accept(identity, signatureOf(0))).toBe(false);
    expect(guard.accept(attacker, signatureOf(100_001))).toBe(false);
  });

  it('accepts new signatures again once entries expire', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0));
    now.mockReturnValue(SignedHttpRequestSignature.REPLAY_WINDOW_MS + 1);

    expect(guard.accept(identity, signatureOf(0))).toBe(true);

    now.mockRestore();
  });
});
