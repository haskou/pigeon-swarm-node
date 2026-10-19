import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
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

export type DeviceSealingRecordFields = {
  deviceCredential: string;
  identityId: string;
  sealingPublicKey: string;
  utcDay: string;
};

export type DeviceSealingRecordKeyFields = Pick<
  DeviceSealingRecordFields,
  'deviceCredential' | 'identityId' | 'utcDay'
>;

export type DeviceSealingRecordPrimitives = {
  record: DeviceSealingRecordFields;
  signature: string;
};

type UnknownRecord = Record<string, unknown>;

export class DeviceSealingRecord {
  private constructor(
    private readonly primitives: DeviceSealingRecordPrimitives,
  ) {}

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

  public static fromStored(value: unknown): DeviceSealingRecord | undefined {
    if (!isObject(value) || !hasExactKeys(value, STORED_FIELDS)) {
      return undefined;
    }
    const { record, signature } = value;
    if (!isObject(record) || !hasExactKeys(record, RECORD_FIELDS)) {
      return undefined;
    }
    if (typeof signature !== 'string' || !isSignatureFormat(signature)) {
      return undefined;
    }
    const { deviceCredential, identityId, sealingPublicKey, utcDay } = record;
    if (
      typeof deviceCredential !== 'string' ||
      typeof identityId !== 'string' ||
      typeof sealingPublicKey !== 'string' ||
      typeof utcDay !== 'string'
    ) {
      return undefined;
    }
    if (!isCanonicalKeyBody(identityId) || !isCanonicalKeyBody(deviceCredential)) {
      return undefined;
    }
    if (!isUtcDay(utcDay) || !isSealingPublicKey(sealingPublicKey)) {
      return undefined;
    }
    if (
      Buffer.byteLength(JSON.stringify(value), 'utf8') >
      MAX_DEVICE_SEALING_RECORD_BYTES
    ) {
      return undefined;
    }

    return new DeviceSealingRecord({
      record: { deviceCredential, identityId, sealingPublicKey, utcDay },
      signature,
    });
  }

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

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, expected: string[]): boolean {
  const actual = Object.keys(value).sort();

  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isSignatureFormat(value: string): boolean {
  try {
    return new Signature(value).valueOf() === value;
  } catch {
    return false;
  }
}

function isCanonicalKeyBody(value: string): boolean {
  try {
    const identityId = new IdentityId(value);

    return identityId.isCanonicalKey() && identityId.valueOf() === value;
  } catch {
    return false;
  }
}

function isUtcDay(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00.000Z`);

  return (
    UTC_DAY_FORMAT.test(value) &&
    !Number.isNaN(time) &&
    new Date(time).toISOString().slice(0, 10) === value
  );
}

function isSealingPublicKey(value: string): boolean {
  const bytes = Buffer.from(value, 'base64url');

  return (
    bytes.length === SEALING_PUBLIC_KEY_BYTES &&
    bytes.toString('base64url') === value
  );
}
