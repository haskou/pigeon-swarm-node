import { PostCallSignalBody } from '@app/apps/apis/calls-api/bodies/PostCallSignalBody';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('PostCallSignalBody', () => {
  const createdAt = 1_770_000_000_000;

  function wire(overrides: Record<string, unknown> = {}) {
    return {
      callId: '550e8400-e29b-41d4-a716-446655440000',
      createdAt,
      expiresAt: createdAt + 20_000,
      networkId: 'f8955c6e-39b1-42cc-8182-42ef86982b4e',
      recipientIdentityId:
        'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
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

  async function errorsFor(body: Record<string, unknown>) {
    return validate(plainToInstance(PostCallSignalBody, body), {
      forbidNonWhitelisted: true,
      whitelist: true,
    });
  }

  it('accepts the signed wire body', async () => {
    expect(await errorsFor(wire())).toHaveLength(0);
  });

  it('refuses a payload field', async () => {
    const errors = await errorsFor(wire({ payload: { sdp: 'v=0' } }));

    expect(errors.map((error) => error.property)).toContain('payload');
  });

  it('refuses the group capability scope type', async () => {
    const errors = await errorsFor(wire({ scopeType: 'group_capability' }));

    expect(errors.map((error) => error.property)).toContain('scopeType');
  });

  it('refuses a signal type outside the enum', async () => {
    const errors = await errorsFor(wire({ signalType: 'hangup' }));

    expect(errors.map((error) => error.property)).toContain('signalType');
  });

  it('refuses more sealed entries than a device set can hold', async () => {
    const errors = await errorsFor(
      wire({
        sealedEntries: Array.from({ length: 129 }, (_, index) => ({
          envelope: 'sealed',
          recipientDeviceCredential: `device-${index}`,
        })),
      }),
    );

    expect(errors.map((error) => error.property)).toContain('sealedEntries');
  });

  it('refuses two sealed entries for the same device credential', async () => {
    const errors = await errorsFor(
      wire({
        sealedEntries: [
          { envelope: 'first', recipientDeviceCredential: 'same-device' },
          { envelope: 'second', recipientDeviceCredential: 'same-device' },
        ],
      }),
    );

    expect(errors.map((error) => error.property)).toContain('sealedEntries');
  });

  it('refuses an oversized envelope', async () => {
    const errors = await errorsFor(
      wire({
        sealedEntries: [
          {
            envelope: 'e'.repeat(32_769),
            recipientDeviceCredential: 'recipient-device',
          },
        ],
      }),
    );

    expect(JSON.stringify(errors)).toContain('envelope');
  });

  it('refuses an oversized device credential', async () => {
    const errors = await errorsFor(
      wire({ senderDeviceCredential: 'c'.repeat(129) }),
    );

    expect(errors.map((error) => error.property)).toContain(
      'senderDeviceCredential',
    );
  });

  it('refuses a plaintext extra key inside a sealed entry', async () => {
    const errors = await errorsFor(
      wire({
        sealedEntries: [
          {
            envelope: 'sealed',
            plaintext: 'v=0',
            recipientDeviceCredential: 'recipient-device',
          },
        ],
      }),
    );

    expect(JSON.stringify(errors)).toContain('plaintext');
  });
});
