import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { DisconnectedPresenceCannotBeSelectedError } from './errors/DisconnectedPresenceCannotBeSelectedError';
import { IdentityPresenceWasUpdatedEvent } from './events/IdentityPresenceWasUpdatedEvent';
import { PresenceCustomMessage } from './value-objects/PresenceCustomMessage';
import { PresenceStatus } from './value-objects/PresenceStatus';

export class IdentityPresence extends AggregateRoot {
  private static readonly HEARTBEAT_TIMEOUT_MS = 10_000;
  private static readonly IDLE_TIMEOUT_MS = 300_000;

  public static disconnected(identityId: IdentityId): IdentityPresence {
    return new IdentityPresence(
      identityId,
      PresenceStatus.DISCONNECTED,
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<IdentityPresence>,
  ): IdentityPresence {
    return new IdentityPresence(
      new IdentityId(primitives.identityId),
      new PresenceStatus(primitives.status),
      new Timestamp(primitives.updatedAt),
      primitives.customMessage
        ? new PresenceCustomMessage(primitives.customMessage)
        : undefined,
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
    private status: PresenceStatus,
    private updatedAt: Timestamp,
    private customMessage?: PresenceCustomMessage,
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

    if (this.status.blocksDerivedStatus()) {
      return this.status;
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
    const primitives = this.toPrimitives();

    this.record(
      new IdentityPresenceWasUpdatedEvent(primitives.identityId, {
        customMessage: primitives.customMessage,
        identityId: primitives.identityId,
        lastActivityAt: primitives.lastActivityAt,
        lastHeartbeatAt: primitives.lastHeartbeatAt,
        networkIds,
        status: primitives.status,
        updatedAt: primitives.updatedAt,
      }),
    );
  }

  private timeoutThreshold(now: Timestamp): Timestamp {
    return new Timestamp(now.valueOf() - IdentityPresence.HEARTBEAT_TIMEOUT_MS);
  }

  public clearCustomMessage(networkIds: string[]): void {
    this.customMessage = undefined;
    this.updatedAt = Timestamp.now();
    this.recordUpdated(networkIds);
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public isVisibleTo(identityId: IdentityId): boolean {
    return this.identityId.isEqual(identityId) || !this.status.isInvisible();
  }

  public recordHeartbeat(
    activityDetected: boolean,
    networkIds: string[],
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
      this.recordUpdated(networkIds);
    }
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
    const previousCustomMessage = this.customMessage;

    if (status) {
      assert(
        status.canBeSelected(),
        new DisconnectedPresenceCannotBeSelectedError(),
      );
      this.status = status;
    }

    if (customMessageWasProvided) {
      this.customMessage = customMessage;
    }

    this.lastHeartbeatAt = now;
    this.lastActivityAt = now;
    this.status = this.derivedStatus(now);
    this.updatedAt = now;

    const customMessageChanged =
      customMessageWasProvided &&
      (previousCustomMessage?.isNotEqual(customMessage) ||
        previousCustomMessage !== customMessage);

    if (this.changedFrom(previous) || customMessageChanged) {
      this.recordUpdated(networkIds);
    }
  }

  public visiblePrimitivesFor(viewerIdentityId: IdentityId): object {
    const primitives = this.toPrimitives();

    if (this.isVisibleTo(viewerIdentityId)) {
      return primitives;
    }

    return {
      identityId: primitives.identityId,
      status: PresenceStatus.DISCONNECTED.valueOf(),
      updatedAt: primitives.updatedAt,
    };
  }

  public toPrimitives() {
    return {
      identityId: this.identityId.valueOf(),
      ...(this.customMessage
        ? { customMessage: this.customMessage.valueOf() }
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
