import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceSealingRecordFields } from '@app/contexts/identity-devices/domain/DeviceSealingRecordFields';
import { DeviceSealingRecordKeyFields } from '@app/contexts/identity-devices/domain/DeviceSealingRecordKeyFields';
import { DeviceSealingRecordPrimitives } from '@app/contexts/identity-devices/domain/DeviceSealingRecordPrimitives';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { CanonicalJson, Signature } from '@haskou/pigeon-swarm-crypto';

export const DEVICE_SEALING_RECORD_HEAD_PREFIX = 'device-sealing-record:';
export const MAX_DEVICE_SEALING_RECORD_BYTES = 1024;

const SIGNING_PREFIX = 'pigeon:device-sealing-record:v1\n';
const STORED_FIELDS = ['record', 'signature'];
const RECORD_FIELDS = [
  'deviceCredential',
  'identityId',
  'sealingPublicKey',
  'utcDay',
];
const SEALING_PUBLIC_KEY_BYTES = 32;
const UTC_DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const actual = Object.keys(value).sort();

  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isSignatureFormat(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return new Signature(value).valueOf() === value;
  } catch {
    return false;
  }
}

function isCanonicalKeyBody(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const identityId = new IdentityId(value);

    return identityId.isCanonicalKey() && identityId.valueOf() === value;
  } catch {
    return false;
  }
}

function isUtcDay(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const time = Date.parse(`${value}T00:00:00.000Z`);

  return (
    UTC_DAY_FORMAT.test(value) &&
    !Number.isNaN(time) &&
    new Date(time).toISOString().slice(0, 10) === value
  );
}

function isSealingPublicKey(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const bytes = Buffer.from(value, 'base64url');

  return (
    bytes.length === SEALING_PUBLIC_KEY_BYTES &&
    bytes.toString('base64url') === value
  );
}

function recordFieldsOf(value: unknown): DeviceSealingRecordFields | undefined {
  if (!isObject(value) || !hasExactKeys(value, RECORD_FIELDS)) {
    return undefined;
  }
  const { deviceCredential, identityId, sealingPublicKey, utcDay } = value;

  if (
    !isCanonicalKeyBody(identityId) ||
    !isCanonicalKeyBody(deviceCredential) ||
    !isSealingPublicKey(sealingPublicKey) ||
    !isUtcDay(utcDay)
  ) {
    return undefined;
  }

  return { deviceCredential, identityId, sealingPublicKey, utcDay };
}

function storedPrimitivesOf(
  value: unknown,
): DeviceSealingRecordPrimitives | undefined {
  if (!isObject(value) || !hasExactKeys(value, STORED_FIELDS)) {
    return undefined;
  }
  const { record, signature } = value;
  const fields = recordFieldsOf(record);

  if (fields === undefined || !isSignatureFormat(signature)) {
    return undefined;
  }

  if (
    Buffer.byteLength(JSON.stringify(value), 'utf8') >
    MAX_DEVICE_SEALING_RECORD_BYTES
  ) {
    return undefined;
  }

  return { record: fields, signature };
}

export class DeviceSealingRecord {
  public static signingContent(fields: DeviceSealingRecordFields): string {
    return `${SIGNING_PREFIX}${CanonicalJson.serialize({
      deviceCredential: fields.deviceCredential,
      identityId: fields.identityId,
      sealingPublicKey: fields.sealingPublicKey,
      utcDay: fields.utcDay,
    })}`;
  }

  public static headKey(fields: DeviceSealingRecordKeyFields): string {
    return `${DEVICE_SEALING_RECORD_HEAD_PREFIX}${fields.identityId}:${fields.deviceCredential}:${fields.utcDay}`;
  }

  /** The UTC day a head key names: its last segment, as `headKey` builds it. */
  public static utcDayOfHeadKey(key: string): string {
    return key.slice(key.lastIndexOf(':') + 1);
  }

  public static fromStored(value: unknown): DeviceSealingRecord | undefined {
    const primitives = storedPrimitivesOf(value);

    return primitives === undefined
      ? undefined
      : new DeviceSealingRecord(primitives);
  }

  private constructor(
    private readonly primitives: DeviceSealingRecordPrimitives,
  ) {}

  public key(): string {
    return DeviceSealingRecord.headKey(this.primitives.record);
  }

  public getIdentityId(): IdentityId {
    return new IdentityId(this.primitives.record.identityId);
  }

  public getDeviceCredential(): DeviceCredential {
    return DeviceCredential.fromWire(this.primitives.record.deviceCredential);
  }

  public getUtcDay(): string {
    return this.primitives.record.utcDay;
  }

  public getSealingPublicKey(): string {
    return this.primitives.record.sealingPublicKey;
  }

  public hasValidSignature(): boolean {
    try {
      return this.getDeviceCredential().isValidSignature(
        DeviceSealingRecord.signingContent(this.primitives.record),
        new Signature(this.primitives.signature),
      );
    } catch {
      return false;
    }
  }

  public toPrimitives(): DeviceSealingRecordPrimitives {
    return {
      record: { ...this.primitives.record },
      signature: this.primitives.signature,
    };
  }
}
