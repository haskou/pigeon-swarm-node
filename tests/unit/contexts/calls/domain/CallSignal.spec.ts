import { CallSignal } from '@app/contexts/calls/domain/CallSignal';
import { InvalidCallSignalError } from '@app/contexts/calls/domain/errors/InvalidCallSignalError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('CallSignal', () => {
  const createdAt = 1_770_000_000_000;
  const recipientIdentityId =
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=';

  function wire(overrides: Record<string, unknown> = {}) {
    return {
      callId: '550e8400-e29b-41d4-a716-446655440000',
      createdAt,
      expiresAt: createdAt + 20_000,
      networkId: 'f8955c6e-39b1-42cc-8182-42ef86982b4e',
      recipientIdentityId,
      scopeType: 'conversation',
      sealedEntries: [
        {
          envelope: 'sealed-envelope-for-recipient-device',
          recipientDeviceCredential: 'recipient-device-credential',
        },
      ],
      senderDeviceCredential: 'sender-device-credential',
      senderIdentityId:
        'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
      signalId: '68da3440-c60e-4fe3-b86a-2b8931ea345f',
      signalType: 'offer',
      signature: 'ed25519-signature-over-signed-bytes',
      ...overrides,
    };
  }

  it('accepts a wire signal whose expiry is exactly twenty seconds after creation', () => {
    const signal = CallSignal.fromPrimitives(wire());

    expect(signal.toPrimitives()).toMatchObject({
      createdAt,
      expiresAt: createdAt + 20_000,
      scopeType: 'conversation',
      signalType: 'offer',
    });
  });

  it('refuses a signal whose expiry is not after the current time', () => {
    const signal = CallSignal.fromPrimitives(wire());

    expect(() =>
      signal.assertFreshAt(new Timestamp(createdAt + 20_000)),
    ).toThrow(InvalidCallSignalError);
  });

  it('accepts a signal whose expiry is one millisecond after the current time', () => {
    const signal = CallSignal.fromPrimitives(wire());

    expect(() =>
      signal.assertFreshAt(new Timestamp(createdAt + 19_999)),
    ).not.toThrow();
  });

  it('refuses a signal created more than five seconds after the current time', () => {
    const signal = CallSignal.fromPrimitives(wire());

    expect(() =>
      signal.assertFreshAt(new Timestamp(createdAt - 5_001)),
    ).toThrow(InvalidCallSignalError);
  });

  it('accepts a signal created exactly five seconds after the current time', () => {
    const signal = CallSignal.fromPrimitives(wire());

    expect(() =>
      signal.assertFreshAt(new Timestamp(createdAt - 5_000)),
    ).not.toThrow();
  });

  it('exposes the wire fields and no payload', () => {
    const primitives = CallSignal.fromPrimitives(wire()).toPrimitives();

    expect(primitives).not.toHaveProperty('payload');
    expect(primitives).toEqual(
      expect.objectContaining({
        callId: '550e8400-e29b-41d4-a716-446655440000',
        networkId: 'f8955c6e-39b1-42cc-8182-42ef86982b4e',
        sealedEntries: [
          {
            envelope: 'sealed-envelope-for-recipient-device',
            recipientDeviceCredential: 'recipient-device-credential',
          },
        ],
        senderDeviceCredential: 'sender-device-credential',
        signature: 'ed25519-signature-over-signed-bytes',
        signalId: '68da3440-c60e-4fe3-b86a-2b8931ea345f',
      }),
    );
  });

  it.each([
    ['one millisecond late', createdAt + 20_001],
    ['one millisecond early', createdAt + 19_999],
    ['without any lifetime', createdAt],
  ])('refuses an expiry %s', (_label, expiresAt) => {
    expect(() => CallSignal.fromPrimitives(wire({ expiresAt }))).toThrow(
      InvalidCallSignalError,
    );
  });

  it('refuses a non-integer creation time', () => {
    expect(() =>
      CallSignal.fromPrimitives(
        wire({ createdAt: createdAt + 0.5, expiresAt: createdAt + 20_000.5 }),
      ),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses an empty signature', () => {
    expect(() => CallSignal.fromPrimitives(wire({ signature: '' }))).toThrow(
      InvalidCallSignalError,
    );
  });

  it('refuses an empty sealed entry list', () => {
    expect(() =>
      CallSignal.fromPrimitives(wire({ sealedEntries: [] })),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses a sealed entry without an envelope', () => {
    expect(() =>
      CallSignal.fromPrimitives(
        wire({
          sealedEntries: [
            { envelope: '', recipientDeviceCredential: 'recipient-device' },
          ],
        }),
      ),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses a sealed entry without a recipient device credential', () => {
    expect(() =>
      CallSignal.fromPrimitives(
        wire({
          sealedEntries: [
            { envelope: 'sealed', recipientDeviceCredential: '' },
          ],
        }),
      ),
    ).toThrow(InvalidCallSignalError);
  });

  it.each(['answer', 'ice_candidate', 'offer'])(
    'accepts the signal type %s',
    (signalType) => {
      expect(() =>
        CallSignal.fromPrimitives(wire({ signalType })),
      ).not.toThrow();
    },
  );

  it.each(['hangup', ''])('refuses the signal type "%s"', (signalType) => {
    expect(() => CallSignal.fromPrimitives(wire({ signalType }))).toThrow(
      InvalidCallSignalError,
    );
  });

  it.each(['conversation', 'community_channel'])(
    'accepts the scope type %s',
    (scopeType) => {
      expect(() =>
        CallSignal.fromPrimitives(wire({ scopeType })),
      ).not.toThrow();
    },
  );

  it('refuses the group capability scope type', () => {
    expect(() =>
      CallSignal.fromPrimitives(wire({ scopeType: 'group_capability' })),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses a signal id that is not a UUID', () => {
    expect(() =>
      CallSignal.fromPrimitives(wire({ signalId: 'not-a-uuid' })),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses sealed entries that are not an array without a raw TypeError', () => {
    expect(() =>
      CallSignal.fromPrimitives(wire({ sealedEntries: 'not-an-array' })),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses a sealed entry that carries a key beyond the two sealed fields', () => {
    expect(() =>
      CallSignal.fromPrimitives(
        wire({
          sealedEntries: [
            {
              envelope: 'sealed',
              plaintext: { sdp: 'v=0' },
              recipientDeviceCredential: 'recipient-device',
            },
          ],
        }),
      ),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses a sealed entry whose fields are not strings', () => {
    expect(() =>
      CallSignal.fromPrimitives(
        wire({
          sealedEntries: [
            { envelope: 7, recipientDeviceCredential: 'recipient-device' },
          ],
        }),
      ),
    ).toThrow(InvalidCallSignalError);
  });

  it('accepts the maximum number of sealed entries and refuses one more', () => {
    const entries = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        envelope: 'sealed',
        recipientDeviceCredential: `recipient-device-${index}`,
      }));

    expect(() =>
      CallSignal.fromPrimitives(
        wire({ sealedEntries: entries(CallSignal.MAX_SEALED_ENTRIES) }),
      ),
    ).not.toThrow();
    expect(() =>
      CallSignal.fromPrimitives(
        wire({ sealedEntries: entries(CallSignal.MAX_SEALED_ENTRIES + 1) }),
      ),
    ).toThrow(InvalidCallSignalError);
  });

  it('refuses two sealed entries for the same recipient device', () => {
    expect(() =>
      CallSignal.fromPrimitives(
        wire({
          sealedEntries: [
            { envelope: 'first', recipientDeviceCredential: 'same-device' },
            { envelope: 'second', recipientDeviceCredential: 'same-device' },
          ],
        }),
      ),
    ).toThrow(InvalidCallSignalError);
  });

  it.each([
    [
      'an envelope',
      {
        sealedEntries: [
          {
            envelope: 'e'.repeat(CallSignal.MAX_ENVELOPE_LENGTH + 1),
            recipientDeviceCredential: 'recipient-device',
          },
        ],
      },
    ],
    [
      'a recipient device credential',
      {
        sealedEntries: [
          {
            envelope: 'sealed',
            recipientDeviceCredential: 'c'.repeat(
              CallSignal.MAX_CREDENTIAL_LENGTH + 1,
            ),
          },
        ],
      },
    ],
    [
      'the sender device credential',
      {
        senderDeviceCredential: 'c'.repeat(
          CallSignal.MAX_CREDENTIAL_LENGTH + 1,
        ),
      },
    ],
    [
      'the signature',
      { signature: 's'.repeat(CallSignal.MAX_SIGNATURE_LENGTH + 1) },
    ],
  ])('refuses %s above its length cap', (_label, override) => {
    expect(() => CallSignal.fromPrimitives(wire(override))).toThrow(
      InvalidCallSignalError,
    );
  });

  it('returns sealed entries holding exactly the two sealed fields', () => {
    const [entry] =
      CallSignal.fromPrimitives(wire()).toPrimitives().sealedEntries;

    expect(Object.keys(entry).sort()).toEqual([
      'envelope',
      'recipientDeviceCredential',
    ]);
  });

  it('knows whether another signal carries the very same signed content', () => {
    const signal = CallSignal.fromPrimitives(wire());

    expect(signal.hasSameContentAs(CallSignal.fromPrimitives(wire()))).toBe(
      true,
    );
    expect(
      signal.hasSameContentAs(
        CallSignal.fromPrimitives(
          wire({
            sealedEntries: [
              {
                envelope: 'attacker-chosen-envelope',
                recipientDeviceCredential: 'recipient-device-credential',
              },
            ],
          }),
        ),
      ),
    ).toBe(false);
  });

  it('identifies the recipient', () => {
    const signal = CallSignal.fromPrimitives(wire());

    expect(signal.isRecipient(new IdentityId(recipientIdentityId))).toBe(true);
    expect(
      signal.isRecipient(
        new IdentityId(
          'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
        ),
      ),
    ).toBe(false);
  });
});
