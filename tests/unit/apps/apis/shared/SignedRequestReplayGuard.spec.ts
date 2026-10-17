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
const SLOTS_PER_SIGNER = 1_000;
const STRANGER_SIGNERS = 10;
const SIGNERS_AT_CAPACITY = 100;

const signersOf = (count: number): Promise<IdentityId[]> =>
  Promise.all(
    Array.from(
      { length: count },
      async () =>
        new IdentityId((await KeyPair.generate()).toPrimitives().publicKey),
    ),
  );

const signatureOf = (index: number): Signature => {
  const bytes = Buffer.alloc(SIGNATURE_BYTES);
  bytes.writeUInt32BE(index);

  return Signature.fromBuffer(bytes);
};

describe('SignedRequestReplayGuard', () => {
  let identity: IdentityId;
  let attacker: IdentityId;
  let strangers: IdentityId[];
  let fillers: IdentityId[];

  beforeAll(async () => {
    [identity, attacker] = await signersOf(2);
    strangers = await signersOf(STRANGER_SIGNERS);
    fillers = await signersOf(SIGNERS_AT_CAPACITY);
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

  it('refuses a signer past its own slot limit without touching another signer', () => {
    const guard = new SignedRequestReplayGuard();

    const accepted = Array.from({ length: SLOTS_PER_SIGNER }).filter(
      (_, index) => guard.accept(attacker, signatureOf(index)),
    );

    expect(accepted).toHaveLength(SLOTS_PER_SIGNER);
    expect(guard.accept(attacker, signatureOf(SLOTS_PER_SIGNER))).toBe(false);
    expect(guard.accept(identity, signatureOf(0))).toBe(true);
  });

  it('frees the slots of a signer as its entries expire', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const guard = new SignedRequestReplayGuard();

    Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
      guard.accept(attacker, signatureOf(index)),
    );
    now.mockReturnValue(SignedHttpRequestSignature.REPLAY_WINDOW_MS + 1);

    expect(guard.accept(attacker, signatureOf(SLOTS_PER_SIGNER))).toBe(true);

    now.mockRestore();
  });

  it('keeps room for known signers while strangers fill their share', () => {
    const guard = new SignedRequestReplayGuard();

    strangers.forEach((stranger) =>
      Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
        guard.acceptFromStranger(stranger, signatureOf(index)),
      ),
    );

    expect(guard.acceptFromStranger(attacker, signatureOf(0))).toBe(false);
    expect(guard.accept(identity, signatureOf(0))).toBe(true);
  });

  it('refuses a stranger replaying a signature a known signer recorded', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0));

    expect(guard.acceptFromStranger(identity, signatureOf(0))).toBe(false);
  });

  it('keeps live entries and fails closed at capacity instead of evicting them', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0));
    fillers.forEach((filler) =>
      Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
        guard.accept(filler, signatureOf(index)),
      ),
    );

    expect(guard.accept(identity, signatureOf(0))).toBe(false);
    expect(guard.accept(identity, signatureOf(1))).toBe(false);
    expect(guard.accept(attacker, signatureOf(0))).toBe(false);
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
