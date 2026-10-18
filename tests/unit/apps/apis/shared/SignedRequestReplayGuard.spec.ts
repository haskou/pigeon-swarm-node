import { SignedRequestReplayGuard } from '@app/apps/apis/shared/SignedRequestReplayGuard';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Kernel } from '@haskou/ddd-kernel';
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

  const fillServedSource = (
    guard: SignedRequestReplayGuard,
    source: string,
  ): void => {
    fillers.slice(0, 3).forEach((filler, signer) => {
      const count =
        signer < 2 ? SLOTS_PER_SIGNER : SERVED_SLOTS_PER_SOURCE - 2 * SLOTS_PER_SIGNER;

      Array.from({ length: count }).forEach((_, index) =>
        guard.accept(filler, signatureOf(index), source),
      );
    });
  };

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

  it('takes the served cap per address from SERVED_SLOTS_PER_SOURCE', () => {
    const previous = process.env.SERVED_SLOTS_PER_SOURCE;
    process.env.SERVED_SLOTS_PER_SOURCE = '3';

    try {
      const guard = new SignedRequestReplayGuard();

      expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(true);
      expect(guard.accept(identity, signatureOf(1), SOURCE)).toBe(true);
      expect(guard.accept(identity, signatureOf(2), SOURCE)).toBe(true);
      expect(guard.accept(identity, signatureOf(3), SOURCE)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.SERVED_SLOTS_PER_SOURCE;
      } else {
        process.env.SERVED_SLOTS_PER_SOURCE = previous;
      }
    }
  });

  it('takes the served cap from the kernel-loaded SERVED_SLOTS_PER_SOURCE', () => {
    const worker = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    const active = jest
      .spyOn(Kernel, 'active', 'get')
      .mockReturnValue({
        environment: { SERVED_SLOTS_PER_SOURCE: 3 },
      } as unknown as Kernel);

    try {
      const guard = new SignedRequestReplayGuard();

      expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(true);
      expect(guard.accept(identity, signatureOf(1), SOURCE)).toBe(true);
      expect(guard.accept(identity, signatureOf(2), SOURCE)).toBe(true);
      expect(guard.accept(identity, signatureOf(3), SOURCE)).toBe(false);
    } finally {
      active.mockRestore();
      if (worker !== undefined) {
        process.env.JEST_WORKER_ID = worker;
      }
    }
  });

  it('charges requests with no client address to one shared unknown bucket', () => {
    const guard = new SignedRequestReplayGuard();
    fillServedSource(guard, 'unknown');

    expect(guard.accept(identity, signatureOf(0), 'unknown')).toBe(false);
    expect(guard.accept(identity, signatureOf(0), '192.0.2.1')).toBe(true);
  });

  it('charges every address in one IPv6 /64 to the same served cap', () => {
    const guard = new SignedRequestReplayGuard();
    fillServedSource(guard, '2001:db8:0:1::1');

    expect(
      guard.accept(identity, signatureOf(0), '2001:db8:0:1:ffff:ffff:ffff:ffff'),
    ).toBe(false);
    expect(guard.accept(identity, signatureOf(0), '2001:db8:0:2::1')).toBe(true);
  });

  it('charges an IPv4-mapped IPv6 address to its IPv4 address', () => {
    const guard = new SignedRequestReplayGuard();
    fillServedSource(guard, '::ffff:192.0.2.1');

    expect(guard.accept(identity, signatureOf(0), '192.0.2.1')).toBe(false);
  });

  it('charges an identity key and a device key from one address to the same served cap', () => {
    const guard = new SignedRequestReplayGuard();
    const device = DeviceCredential.fromIdentityId(fillers[1]);

    Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
      guard.accept(fillers[0], signatureOf(index), SOURCE),
    );
    Array.from({ length: SLOTS_PER_SIGNER }).forEach((_, index) =>
      guard.accept(device, signatureOf(index), SOURCE),
    );
    Array.from({ length: SERVED_SLOTS_PER_SOURCE - 2 * SLOTS_PER_SIGNER }).forEach(
      (_, index) => guard.accept(fillers[2], signatureOf(index), SOURCE),
    );

    expect(guard.accept(fillers[3], signatureOf(0), SOURCE)).toBe(false);
    expect(guard.accept(fillers[3], signatureOf(0), '192.0.2.99')).toBe(true);
  });

  it('does not let a full served share refuse a stranger from the same address', () => {
    const guard = new SignedRequestReplayGuard();
    fillServedSource(guard, SOURCE);

    expect(guard.acceptFromStranger(strangers[0], signatureOf(0), SOURCE)).toBe(
      true,
    );
  });

  it('does not let a full stranger share refuse an identity from the same address', () => {
    const guard = new SignedRequestReplayGuard();
    Array.from({ length: STRANGER_SLOTS_PER_SOURCE }).forEach((_, index) =>
      guard.acceptFromStranger(strangers[0], signatureOf(index), SOURCE),
    );

    expect(guard.acceptFromStranger(strangers[1], signatureOf(0), SOURCE)).toBe(
      false,
    );
    expect(guard.accept(identity, signatureOf(0), SOURCE)).toBe(true);
  });
});
