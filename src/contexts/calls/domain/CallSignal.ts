import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert, Timestamp } from '@haskou/value-objects';

import { InvalidCallSignalError } from './errors/InvalidCallSignalError';
import { CallId } from './value-objects/CallId';
import { CallScopeType } from './value-objects/CallScopeType';
import { CallSignalId } from './value-objects/CallSignalId';
import { CallSignalType } from './value-objects/CallSignalType';

export const CALL_SIGNAL_MAX_CLOCK_SKEW_MS = 5_000;

export type CallSignalSealedEntry = {
  envelope: string;
  recipientDeviceCredential: string;
};

export interface CallSignalAttributes {
  callId: string;
  createdAt: number;
  expiresAt: number;
  networkId: string;
  recipientIdentityId: string;
  scopeType: string;
  sealedEntries: CallSignalSealedEntry[];
  senderDeviceCredential: string;
  senderIdentityId: string;
  signalId: string;
  signalType: string;
  signature: string;
}

const isBoundedString = (value: unknown, max: number): boolean =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

const hasBoundedSignatureAndCredential = (
  attributes: CallSignalAttributes,
): boolean =>
  isBoundedString(attributes.signature, CallSignal.MAX_SIGNATURE_LENGTH) &&
  isBoundedString(
    attributes.senderDeviceCredential,
    CallSignal.MAX_CREDENTIAL_LENGTH,
  );

/** Exactly the two opaque string fields, within their bounds: nothing else rides along. */
const isSealedEntry = (entry: unknown): entry is CallSignalSealedEntry => {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const { envelope, recipientDeviceCredential } =
    entry as Partial<CallSignalSealedEntry>;

  return (
    Object.keys(entry).length === 2 &&
    isBoundedString(envelope, CallSignal.MAX_ENVELOPE_LENGTH) &&
    isBoundedString(recipientDeviceCredential, CallSignal.MAX_CREDENTIAL_LENGTH)
  );
};

const areSealedEntries = (
  entries: unknown,
): entries is CallSignalSealedEntry[] =>
  Array.isArray(entries) &&
  entries.length > 0 &&
  entries.length <= CallSignal.MAX_SEALED_ENTRIES &&
  entries.every(isSealedEntry) &&
  new Set(entries.map((entry) => entry.recipientDeviceCredential)).size ===
    entries.length;

/**
 * A signed call signal as the node carries it. `envelope` and `signature` are
 * opaque here: the node never decrypts or verifies them, the UI does.
 */
export class CallSignal {
  public static readonly LIFETIME_MS = 20_000;
  public static readonly MAX_SEALED_ENTRIES = 128;
  public static readonly MAX_ENVELOPE_LENGTH = 32_768;
  public static readonly MAX_CREDENTIAL_LENGTH = 128;
  public static readonly MAX_SIGNATURE_LENGTH = 256;

  private readonly callId: CallId;
  private readonly createdAt: Timestamp;
  private readonly expiresAt: Timestamp;
  private readonly networkId: NetworkId;
  private readonly recipientIdentityId: IdentityId;
  private readonly scopeType: CallScopeType;
  private readonly sealedEntries: CallSignalSealedEntry[];
  private readonly senderDeviceCredential: string;
  private readonly senderIdentityId: IdentityId;
  private readonly signalId: CallSignalId;
  private readonly signalType: CallSignalType;
  private readonly signature: string;

  /** The single presence check for a call signal, shared by the route and the consumer. */
  public static fromPrimitives(attributes: CallSignalAttributes): CallSignal {
    try {
      return new CallSignal(attributes);
    } catch {
      throw new InvalidCallSignalError();
    }
  }

  private constructor(attributes: CallSignalAttributes) {
    const {
      createdAt,
      expiresAt,
      sealedEntries,
      senderDeviceCredential,
      signature,
    } = attributes;

    assert(
      Number.isSafeInteger(createdAt) &&
        expiresAt === createdAt + CallSignal.LIFETIME_MS,
      new InvalidCallSignalError(),
    );
    assert(
      hasBoundedSignatureAndCredential(attributes) &&
        areSealedEntries(sealedEntries),
      new InvalidCallSignalError(),
    );

    this.callId = new CallId(attributes.callId);
    this.createdAt = new Timestamp(createdAt);
    this.expiresAt = new Timestamp(expiresAt);
    this.networkId = new NetworkId(attributes.networkId);
    this.recipientIdentityId = new IdentityId(attributes.recipientIdentityId);
    this.scopeType = new CallScopeType(attributes.scopeType);
    assert(!this.scopeType.isGroupCapability(), new InvalidCallSignalError());
    this.sealedEntries = sealedEntries.map((entry) => ({
      envelope: entry.envelope,
      recipientDeviceCredential: entry.recipientDeviceCredential,
    }));
    this.senderDeviceCredential = senderDeviceCredential;
    this.senderIdentityId = new IdentityId(attributes.senderIdentityId);
    this.signalId = new CallSignalId(attributes.signalId);
    this.signalType = new CallSignalType(attributes.signalType);
    this.signature = signature;
  }

  /** Refuses a signal that has expired, or whose creation time is beyond the clock-skew bound. */
  public assertFreshAt(at: Timestamp): void {
    const createdAt = this.getExpiresAt().valueOf() - CallSignal.LIFETIME_MS;
    assert(
      this.getExpiresAt().valueOf() > at.valueOf() &&
        createdAt <= at.valueOf() + CALL_SIGNAL_MAX_CLOCK_SKEW_MS,
      new InvalidCallSignalError(),
    );
  }

  public getCallId(): CallId {
    return this.callId;
  }

  public getExpiresAt(): Timestamp {
    return this.expiresAt;
  }

  public getId(): CallSignalId {
    return this.signalId;
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public getRecipientIdentityId(): IdentityId {
    return this.recipientIdentityId;
  }

  public getScopeType(): CallScopeType {
    return this.scopeType;
  }

  public getSenderIdentityId(): IdentityId {
    return this.senderIdentityId;
  }

  /** Whether both carry the same sealed content: a higher attempt must not rewrite it. */
  public hasSameContentAs(other: CallSignal): boolean {
    return (
      JSON.stringify(this.toPrimitives()) ===
      JSON.stringify(other.toPrimitives())
    );
  }

  public isRecipient(identityId: IdentityId): boolean {
    return this.recipientIdentityId.isEqual(identityId);
  }

  public toPrimitives(): CallSignalAttributes {
    return {
      callId: this.callId.valueOf(),
      createdAt: this.createdAt.valueOf(),
      expiresAt: this.expiresAt.valueOf(),
      networkId: this.networkId.valueOf(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
      scopeType: this.scopeType.valueOf(),
      sealedEntries: this.sealedEntries.map((entry) => ({ ...entry })),
      senderDeviceCredential: this.senderDeviceCredential,
      senderIdentityId: this.senderIdentityId.valueOf(),
      signalId: this.signalId.valueOf(),
      signalType: this.signalType.valueOf(),
      signature: this.signature,
    };
  }
}
