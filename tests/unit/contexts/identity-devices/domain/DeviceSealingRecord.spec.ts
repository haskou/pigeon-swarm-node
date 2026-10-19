import {
  DEVICE_SEALING_RECORD_HEAD_PREFIX,
  DeviceSealingRecord,
  MAX_DEVICE_SEALING_RECORD_BYTES,
} from '@app/contexts/identity-devices/domain/DeviceSealingRecord';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import { credentialOf } from '../DeviceSealedSecretFixtures';
import {
  sealingPublicKeyOf,
  sealingRecordOf,
  signedRecordPrimitives,
} from '../DeviceSealingRecordFixtures';

describe('DeviceSealingRecord', () => {
  let owner: KeyPair;
  let other: KeyPair;
  let identityId: string;

  beforeAll(async () => {
    owner = await KeyPair.generate();
    other = await KeyPair.generate();
    identityId = credentialOf(await KeyPair.generate());
  });

  it('[vector: sealing-record-canonical-content] signs the prefix and the canonical JSON of the four fields', () => {
    expect(
      DeviceSealingRecord.signingContent({
        deviceCredential: 'device-vector',
        identityId: 'identity-vector',
        sealingPublicKey: 'sealing-vector',
        utcDay: '2026-05-02',
      }),
    ).toBe(
      'pigeon:device-sealing-record:v1\n{"deviceCredential":"device-vector","identityId":"identity-vector","sealingPublicKey":"sealing-vector","utcDay":"2026-05-02"}',
    );
  });

  it('signs the same content whatever order the fields are given in', () => {
    expect(
      DeviceSealingRecord.signingContent({
        utcDay: '2026-05-02',
        sealingPublicKey: 'sealing-vector',
        identityId: 'identity-vector',
        deviceCredential: 'device-vector',
      }),
    ).toBe(
      DeviceSealingRecord.signingContent({
        deviceCredential: 'device-vector',
        identityId: 'identity-vector',
        sealingPublicKey: 'sealing-vector',
        utcDay: '2026-05-02',
      }),
    );
  });

  it('derives the head key from identity, device credential and UTC day', () => {
    expect(DEVICE_SEALING_RECORD_HEAD_PREFIX).toBe('device-sealing-record:');
    expect(
      DeviceSealingRecord.headKey({
        deviceCredential: 'device-vector',
        identityId: 'identity-vector',
        utcDay: '2026-05-02',
      }),
    ).toBe('device-sealing-record:identity-vector:device-vector:2026-05-02');
  });

  it('accepts a stored record with exactly the four fields and a signature', () => {
    expect(
      DeviceSealingRecord.fromStored(
        signedRecordPrimitives({ identityId, signer: owner }),
      ),
    ).toBeDefined();
  });

  it('refuses a stored record with an extra top-level field', () => {
    expect(
      DeviceSealingRecord.fromStored({
        ...signedRecordPrimitives({ identityId, signer: owner }),
        extra: 'x',
      }),
    ).toBeUndefined();
  });

  it('refuses a stored record with an extra field inside the record', () => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(
      DeviceSealingRecord.fromStored({
        ...primitives,
        record: { ...primitives.record, extra: 'x' },
      }),
    ).toBeUndefined();
  });

  it('refuses a stored record without a signature', () => {
    const { record } = signedRecordPrimitives({ identityId, signer: owner });

    expect(DeviceSealingRecord.fromStored({ record })).toBeUndefined();
  });

  it('refuses a stored value that is not an object', () => {
    expect(
      DeviceSealingRecord.fromStored('device-sealing-record'),
    ).toBeUndefined();
  });

  it.each([
    ['not a real calendar day', '2026-02-30'],
    ['not zero-padded', '2026-5-1'],
    ['carries a time', '2026-05-02T00:00:00Z'],
  ])('refuses a UTC day that is %s', (_label, utcDay) => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(
      DeviceSealingRecord.fromStored({
        ...primitives,
        record: { ...primitives.record, utcDay },
      }),
    ).toBeUndefined();
  });

  it.each([
    ['42 characters', 'A'.repeat(42)],
    ['44 characters', 'A'.repeat(44)],
    ['non-canonical trailing bits', `${'A'.repeat(42)}B`],
    ['standard base64 padding', Buffer.alloc(32, 1).toString('base64')],
  ])('refuses a sealing public key with %s', (_label, sealingPublicKey) => {
    const primitives = signedRecordPrimitives({
      identityId,
      signer: owner,
      sealingPublicKey: sealingPublicKeyOf(1),
    });

    expect(
      DeviceSealingRecord.fromStored({
        ...primitives,
        record: { ...primitives.record, sealingPublicKey },
      }),
    ).toBeUndefined();
  });

  it('refuses a stored record whose identity id is not a canonical key body', () => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(
      DeviceSealingRecord.fromStored({
        ...primitives,
        record: { ...primitives.record, identityId: 'not-a-key' },
      }),
    ).toBeUndefined();
  });

  it('refuses a stored record whose device credential is not a canonical key body', () => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(
      DeviceSealingRecord.fromStored({
        ...primitives,
        record: { ...primitives.record, deviceCredential: 'not-a-key' },
      }),
    ).toBeUndefined();
  });

  it('refuses a stored record over the size cap', () => {
    const oversized = {
      ...signedRecordPrimitives({ identityId, signer: owner }),
      padding: 'x'.repeat(MAX_DEVICE_SEALING_RECORD_BYTES),
    };

    expect(Buffer.byteLength(JSON.stringify(oversized), 'utf8')).toBeGreaterThan(
      MAX_DEVICE_SEALING_RECORD_BYTES,
    );
    expect(DeviceSealingRecord.fromStored(oversized)).toBeUndefined();
  });

  it('verifies the device signature over the canonical content', () => {
    expect(
      sealingRecordOf({ identityId, signer: owner }).hasValidSignature(),
    ).toBe(true);
  });

  it('refuses a signature once the UTC day was changed after signing', () => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(
      DeviceSealingRecord.fromStored({
        ...primitives,
        record: { ...primitives.record, utcDay: '2026-05-01' },
      })?.hasValidSignature(),
    ).toBe(false);
  });

  it('refuses a signature from a device other than the named credential', () => {
    expect(
      sealingRecordOf({
        deviceCredential: credentialOf(owner),
        identityId,
        signer: other,
      }).hasValidSignature(),
    ).toBe(false);
  });

  it('refuses a signature once the sealing key was swapped after signing', () => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(
      DeviceSealingRecord.fromStored({
        ...primitives,
        record: {
          ...primitives.record,
          sealingPublicKey: sealingPublicKeyOf(9),
        },
      })?.hasValidSignature(),
    ).toBe(false);
  });

  it('round-trips through its stored primitives', () => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(DeviceSealingRecord.fromStored(primitives)?.toPrimitives()).toEqual(
      primitives,
    );
  });

  it('stores only the record fields and the signature at top level', () => {
    const primitives = signedRecordPrimitives({ identityId, signer: owner });

    expect(Object.keys(primitives).sort()).toEqual(['record', 'signature']);
    expect(Object.keys(primitives.record).sort()).toEqual([
      'deviceCredential',
      'identityId',
      'sealingPublicKey',
      'utcDay',
    ]);
  });
});
