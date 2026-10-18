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
const SERVED_SLOTS_PER_SOURCE = 2_500;
const STRANGER_SIGNERS = 10;
const STRANGER_SLOTS_PER_SOURCE = 250;
const SIGNERS_AT_CAPACITY = 100;
const SOURCE = '192.0.2.10';

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

    expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(true);
    expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(false);
  });

  it('accepts the same signature for another identity', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0), SOURCE);

    expect(guard.accept(attacker, signatureOf(0), SOURCE)).toBe(true);
  });

  it('rejects a repeated signature when the same key signs as a device', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0), SOURCE);

    expect(
      guard.accept(
        DeviceCredential.fromIdentityId(identity),
        signatureOf(0),
        SOURCE,
      ),
    ).toBe(false);
  });

  it.each(IdentityIdMother.aliases())(
    'rejects a repeated signature that names the key by %s',
    (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const guard = new SignedRequestReplayGuard();

      guard.accept(identity, signatureOf(0), SOURCE);

      expect(guard.accept(aliasOf(identity), signatureOf(0), SOURCE)).toBe(
        false,
      );
    },
  );

  it.each(IdentityIdMother.aliases())(
    'rejects a signer named by %s even on its first signature',
    (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const guard = new SignedRequestReplayGuard();

      expect(guard.accept(aliasOf(identity), signatureOf(0), SOURCE)).toBe(
        false,
      );
    },
  );

  it('refuses a signer past its own slot limit without touching another signer', () => {
    const guard = new SignedRequestReplayGuard();

    const accepted = Array.from({ length: SLOTS_PER_SIGNER }).filter(
      (_, index) => guard.accept(attacker, signatureOf(index), SOURCE),
    );

    expect(accepted).toHaveLength(SLOTS_PER_SIGNER);
    expect(guard.accept(attacker, signatureOf(SLOTS_PER_SIGNER), SOURCE)).toBe(
      false,
    );
    expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(true);
  });

  it('frees the slots of a signer as its entries expire', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const guard = new SignedRequestReplayGuard();

    Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
      guard.accept(attacker, signatureOf(index), SOURCE),
    );
    now.mockReturnValue(SignedHttpRequestSignature.REPLAY_WINDOW_MS + 1);

    expect(guard.accept(attacker, signatureOf(SLOTS_PER_SIGNER), SOURCE)).toBe(
      true,
    );

    now.mockRestore();
  });

  it('refuses a client address past its part of the served slots without touching other addresses', () => {
    const guard = new SignedRequestReplayGuard();

    const accepted = fillers
      .slice(0, 3)
      .flatMap((filler) =>
        Array.from({ length: SLOTS_PER_SIGNER }).filter((_, index) =>
          guard.accept(filler, signatureOf(index), '192.0.2.1'),
        ),
      );

    expect(accepted).toHaveLength(SERVED_SLOTS_PER_SOURCE);
    expect(guard.accept(identity, signatureOf(0), '192.0.2.1')).toBe(false);
    expect(guard.accept(identity, signatureOf(0), '192.0.2.2')).toBe(true);
  });

  it('keeps the guard open to other client addresses while held signers of one address flood it', () => {
    const guard = new SignedRequestReplayGuard();

    fillers.forEach((filler) =>
      Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
        guard.accept(filler, signatureOf(index), '192.0.2.1'),
      ),
    );

    expect(guard.accept(identity, signatureOf(0), '192.0.2.2')).toBe(true);
    expect(guard.accept(attacker, signatureOf(0), '192.0.2.2')).toBe(true);
  });

  it('frees the served slots of a client address as its entries expire', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const guard = new SignedRequestReplayGuard();

    Array.from({ length: SERVED_SLOTS_PER_SOURCE }).forEach((_, index) =>
      guard.accept(
        fillers[Math.floor(index / SLOTS_PER_SIGNER)],
        signatureOf(index % SLOTS_PER_SIGNER),
        '192.0.2.1',
      ),
    );
    expect(guard.accept(identity, signatureOf(0), '192.0.2.1')).toBe(false);
    now.mockReturnValue(SignedHttpRequestSignature.REPLAY_WINDOW_MS + 1);

    expect(guard.accept(identity, signatureOf(0), '192.0.2.1')).toBe(true);

    now.mockRestore();
  });

  it('keeps room for known signers while strangers fill their share', () => {
    const guard = new SignedRequestReplayGuard();

    strangers.forEach((stranger, signer) =>
      Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
        guard.acceptFromStranger(
          stranger,
          signatureOf(index),
          `198.51.${signer}.${Math.floor(index / STRANGER_SLOTS_PER_SOURCE)}`,
        ),
      ),
    );

    expect(
      guard.acceptFromStranger(attacker, signatureOf(0), '192.0.2.1'),
    ).toBe(false);
    expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(true);
  });

  it('refuses a client address past its part of the stranger share without touching other addresses', () => {
    const guard = new SignedRequestReplayGuard();

    const accepted = [strangers[0], strangers[1]].flatMap((stranger) =>
      Array.from({ length: STRANGER_SLOTS_PER_SOURCE }).filter((_, index) =>
        guard.acceptFromStranger(stranger, signatureOf(index), '192.0.2.1'),
      ),
    );

    expect(accepted).toHaveLength(STRANGER_SLOTS_PER_SOURCE);
    expect(
      guard.acceptFromStranger(strangers[2], signatureOf(0), '192.0.2.1'),
    ).toBe(false);
    expect(
      guard.acceptFromStranger(strangers[2], signatureOf(0), '192.0.2.2'),
    ).toBe(true);
  });

  it('counts the stranger slots of a whole IPv6 /64 as one client address', () => {
    const guard = new SignedRequestReplayGuard();

    Array.from({ length: STRANGER_SLOTS_PER_SOURCE }).forEach((_, index) =>
      guard.acceptFromStranger(
        strangers[0],
        signatureOf(index),
        '2001:db8:0:1::1',
      ),
    );

    expect(
      guard.acceptFromStranger(strangers[1], signatureOf(0), '2001:db8:0:1::2'),
    ).toBe(false);
  });

  it('counts the stranger slots of an IPv4-mapped address against its IPv4 address', () => {
    const guard = new SignedRequestReplayGuard();

    Array.from({ length: STRANGER_SLOTS_PER_SOURCE }).forEach((_, index) =>
      guard.acceptFromStranger(
        strangers[0],
        signatureOf(index),
        '::ffff:192.0.2.1',
      ),
    );

    expect(
      guard.acceptFromStranger(strangers[1], signatureOf(0), '192.0.2.1'),
    ).toBe(false);
    expect(
      guard.acceptFromStranger(
        strangers[1],
        signatureOf(1),
        '::ffff:192.0.2.2',
      ),
    ).toBe(true);
  });

  it('frees the stranger slots of a client address as its entries expire', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const guard = new SignedRequestReplayGuard();

    Array.from({ length: STRANGER_SLOTS_PER_SOURCE }).forEach((_, index) =>
      guard.acceptFromStranger(strangers[0], signatureOf(index), '192.0.2.1'),
    );
    expect(
      guard.acceptFromStranger(strangers[1], signatureOf(0), '192.0.2.1'),
    ).toBe(false);
    now.mockReturnValue(SignedHttpRequestSignature.REPLAY_WINDOW_MS + 1);

    expect(
      guard.acceptFromStranger(strangers[1], signatureOf(0), '192.0.2.1'),
    ).toBe(true);

    now.mockRestore();
  });

  it('refuses a stranger replaying a signature a known signer recorded', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0), SOURCE);

    expect(
      guard.acceptFromStranger(identity, signatureOf(0), '192.0.2.1'),
    ).toBe(false);
  });

  it('keeps live entries and fails closed at capacity instead of evicting them', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0), SOURCE);
    fillers.forEach((filler, signer) =>
      Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
        guard.accept(filler, signatureOf(index), `198.51.100.${signer}`),
      ),
    );

    expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(false);
    expect(guard.accept(identity, signatureOf(1), SOURCE)).toBe(false);
    expect(guard.accept(attacker, signatureOf(0), SOURCE)).toBe(false);
  });

  it('accepts new signatures again once entries expire', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const guard = new SignedRequestReplayGuard();

    guard.accept(identity, signatureOf(0), SOURCE);
    now.mockReturnValue(SignedHttpRequestSignature.REPLAY_WINDOW_MS + 1);

    expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(true);

    now.mockRestore();
  });
});
