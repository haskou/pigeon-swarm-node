import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { IdentityPresenceWasUpdatedEvent } from './events/IdentityPresenceWasUpdatedEvent';
import { IdentityPresencePreference } from './IdentityPresencePreference';
import { PresenceCustomMessage } from './value-objects/PresenceCustomMessage';
import { PresenceStatus } from './value-objects/PresenceStatus';

export class IdentityPresence extends AggregateRoot {
  private static readonly HEARTBEAT_TIMEOUT_MS = 20_000;
  private static readonly IDLE_TIMEOUT_MS = 300_000;

  public static disconnected(identityId: IdentityId): IdentityPresence {
    return new IdentityPresence(
      identityId,
      new IdentityPresencePreference(PresenceStatus.AVAILABLE, Timestamp.now()),
      PresenceStatus.DISCONNECTED,
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<IdentityPresence>,
  ): IdentityPresence {
    return new IdentityPresence(
      new IdentityId(primitives.identityId),
      IdentityPresencePreference.fromPrimitives(
        primitives.selectedStatus,
        primitives.preferenceUpdatedAt,
        primitives.customMessage,
      ),
      new PresenceStatus(primitives.status),
      new Timestamp(primitives.updatedAt),
      primitives.lastHeartbeatAt
        ? new Timestamp(primitives.lastHeartbeatAt)
        : undefined,
      primitives.lastActivityAt
        ? new Timestamp(primitives.lastActivityAt)
        : undefined,
    );
  }

  constructor(
    private readonly identityId: IdentityId,
    private readonly preference: IdentityPresencePreference,
    private status: PresenceStatus,
    private updatedAt: Timestamp,
    private lastHeartbeatAt?: Timestamp,
    private lastActivityAt?: Timestamp,
  ) {
    super();
  }

  private changedFrom(previous: PresenceStatus): boolean {
    return this.status.isNotEqual(previous);
  }

  private derivedStatus(now: Timestamp): PresenceStatus {
    if (this.lastHeartbeatAt?.isBefore(this.timeoutThreshold(now))) {
      return PresenceStatus.DISCONNECTED;
    }

    if (this.preference.blocksDerivedStatus()) {
      return this.preference.selected();
    }

    if (this.lastActivityAt?.isBeforeOrEqual(this.idleThreshold(now))) {
      return PresenceStatus.AWAY;
    }

    return PresenceStatus.AVAILABLE;
  }

  private idleThreshold(now: Timestamp): Timestamp {
    return new Timestamp(now.valueOf() - IdentityPresence.IDLE_TIMEOUT_MS);
  }

  private recordUpdated(): void {
    const primitives = this.toPrimitives();
    const preference = this.preference.toPrimitives();

    this.record(
      new IdentityPresenceWasUpdatedEvent(primitives.identityId, {
        customMessage: preference.customMessage,
        identityId: primitives.identityId,
        lastActivityAt: primitives.lastActivityAt,
        lastHeartbeatAt: primitives.lastHeartbeatAt,
        preferenceUpdatedAt: preference.updatedAt,
        selectedStatus: preference.selectedStatus,
        status: primitives.status,
        updatedAt: primitives.updatedAt,
      }),
    );
  }

  private timeoutThreshold(now: Timestamp): Timestamp {
    return new Timestamp(now.valueOf() - IdentityPresence.HEARTBEAT_TIMEOUT_MS);
  }

  public clearCustomMessage(): void {
    this.updatedAt = Timestamp.now();

    if (this.preference.clearCustomMessage(this.updatedAt)) {
      this.recordUpdated();
    }
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public isConnected(): boolean {
    return !this.status.isDisconnected();
  }

  public isVisibleTo(
    viewerIdentityId: IdentityId,
    sharesRelationship: boolean,
  ): boolean {
    return (
      this.identityId.isEqual(viewerIdentityId) ||
      (sharesRelationship && !this.status.isInvisible())
    );
  }

  public isBusy(): boolean {
    return this.status.isBusy();
  }

  public recordHeartbeat(
    activityDetected: boolean,
    now: Timestamp = Timestamp.now(),
  ): void {
    const previous = this.status;

    this.lastHeartbeatAt = now;

    if (activityDetected) {
      this.lastActivityAt = now;
    }

    this.status = this.derivedStatus(now);
    this.updatedAt = now;

    if (this.changedFrom(previous)) {
      this.recordUpdated();
    }
  }

  public refreshDerivedStatus(now: Timestamp = Timestamp.now()): boolean {
    const previous = this.status;

    this.status = this.derivedStatus(now);

    if (!this.changedFrom(previous)) {
      return false;
    }

    this.updatedAt = now;
    this.recordUpdated();

    return true;
  }

  public update(
    status: PresenceStatus | undefined,
    customMessage: PresenceCustomMessage | undefined,
    customMessageWasProvided: boolean,
    now: Timestamp = Timestamp.now(),
  ): void {
    const previous = this.status;
    const preferenceChanged = this.preference.update(
      status,
      customMessage,
      customMessageWasProvided,
      now,
    );

    this.lastHeartbeatAt = now;
    this.lastActivityAt = now;
    this.status = this.derivedStatus(now);
    this.updatedAt = now;

    if (this.changedFrom(previous) || preferenceChanged) {
      this.recordUpdated();
    }
  }

  public toPrimitives() {
    const preference = this.preference.toPrimitives();

    return {
      identityId: this.identityId.valueOf(),
      preferenceUpdatedAt: preference.updatedAt,
      selectedStatus: preference.selectedStatus,
      ...(preference.customMessage
        ? { customMessage: preference.customMessage }
        : {}),
      ...(this.lastActivityAt
        ? { lastActivityAt: this.lastActivityAt.valueOf() }
        : {}),
      ...(this.lastHeartbeatAt
        ? { lastHeartbeatAt: this.lastHeartbeatAt.valueOf() }
        : {}),
      status: this.status.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
