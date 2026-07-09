import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { IdentityPresenceWasUpdatedEvent } from './events/IdentityPresenceWasUpdatedEvent';
import { IdentityPresencePreference } from './IdentityPresencePreference';
import { PresenceCustomMessage } from './value-objects/PresenceCustomMessage';
import { PresenceStatus } from './value-objects/PresenceStatus';

export class IdentityPresence extends AggregateRoot {
  private static readonly HEARTBEAT_TIMEOUT_MS = 20_000;
  private static readonly IDLE_TIMEOUT_MS = 300_000;

  public static disconnected(
    identityId: IdentityId,
    ownerNodeId: NodeId,
  ): IdentityPresence {
    return new IdentityPresence(
      identityId,
      ownerNodeId,
      new IdentityPresencePreference(PresenceStatus.AVAILABLE, Timestamp.now()),
      PresenceStatus.DISCONNECTED,
      Timestamp.now(),
    );
  }

  public static unobserved(identityId: IdentityId): IdentityPresence {
    return new IdentityPresence(
      identityId,
      undefined,
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
      primitives.ownerNodeId ? new NodeId(primitives.ownerNodeId) : undefined,
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
    private readonly ownerNodeId: NodeId | undefined,
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

  private recordUpdated(networkIds: string[]): void {
    assert(
      this.ownerNodeId,
      new Error('Presence lease requires an owner node'),
    );
    const primitives = this.toPrimitives();
    const preference = this.preference.toPrimitives();

    this.record(
      new IdentityPresenceWasUpdatedEvent(primitives.identityId, {
        customMessage: preference.customMessage,
        identityId: primitives.identityId,
        lastActivityAt: primitives.lastActivityAt,
        lastHeartbeatAt: primitives.lastHeartbeatAt,
        networkIds,
        ownerNodeId: this.ownerNodeId.valueOf(),
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

  public clearCustomMessage(networkIds: string[]): void {
    this.updatedAt = Timestamp.now();

    if (this.preference.clearCustomMessage(this.updatedAt)) {
      this.recordUpdated(networkIds);
    }
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public belongsToNode(nodeId: NodeId): boolean {
    return this.ownerNodeId?.isEqual(nodeId) === true;
  }

  public isConnected(): boolean {
    return !this.status.isDisconnected();
  }

  public mergePreferenceFrom(presence: IdentityPresence): void {
    this.preference.mergeFrom(presence.preference);
    this.status = this.derivedStatus(this.updatedAt);
  }

  public isVisibleTo(identityId: IdentityId): boolean {
    return this.identityId.isEqual(identityId) || !this.status.isInvisible();
  }

  public isBusy(): boolean {
    return this.status.isBusy();
  }

  public recordHeartbeat(
    activityDetected: boolean,
    networkIds: string[],
    now: Timestamp = Timestamp.now(),
  ): void {
    this.lastHeartbeatAt = now;

    if (activityDetected) {
      this.lastActivityAt = now;
    }

    this.status = this.derivedStatus(now);
    this.updatedAt = now;

    this.recordUpdated(networkIds);
  }

  public refreshDerivedStatus(
    networkIds: string[],
    now: Timestamp = Timestamp.now(),
  ): boolean {
    const previous = this.status;

    this.status = this.derivedStatus(now);

    if (!this.changedFrom(previous)) {
      return false;
    }

    this.updatedAt = now;
    this.recordUpdated(networkIds);

    return true;
  }

  public update(
    status: PresenceStatus | undefined,
    customMessage: PresenceCustomMessage | undefined,
    customMessageWasProvided: boolean,
    networkIds: string[],
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
      this.recordUpdated(networkIds);
    }
  }

  public toPrimitives() {
    const preference = this.preference.toPrimitives();

    return {
      identityId: this.identityId.valueOf(),
      ...(this.ownerNodeId ? { ownerNodeId: this.ownerNodeId.valueOf() } : {}),
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
