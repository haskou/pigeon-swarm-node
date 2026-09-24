import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf, Timestamp, assert } from '@haskou/value-objects';

import { CallParticipantLeaseRoute } from './CallParticipantLeaseRoute';
import { CallParticipantMediaConnection } from './CallParticipantMediaConnection';
import { InvalidCallParticipantMediaConnectionError } from './errors/InvalidCallParticipantMediaConnectionError';
import { CallParticipantLeaseWasUpdatedEvent } from './events/CallParticipantLeaseWasUpdatedEvent';
import { CallId } from './value-objects/CallId';
import { CallParticipantConnectionStatus } from './value-objects/CallParticipantConnectionStatus';

export class CallParticipantLease extends AggregateRoot {
  public static readonly RETENTION_MS = 60000;

  public static readonly CLOCK_SKEW_MS = 5000;
  public static connect(
    callId: CallId,
    participantIdentityId: IdentityId,
    ownerNodeId: NodeId,
    networkId: NetworkId,
    participantIds: IdentityId[],
    mediaConnections: CallParticipantMediaConnection[] = [],
    now: Timestamp = Timestamp.now(),
  ): CallParticipantLease {
    const lease = new CallParticipantLease(
      participantIdentityId,
      new CallParticipantLeaseRoute(
        callId,
        ownerNodeId,
        networkId,
        participantIds,
      ),
      CallParticipantConnectionStatus.CONNECTED,
      now,
      mediaConnections,
    );

    lease.assertMediaConnectionsAreValid(mediaConnections);
    lease.recordUpdated(true, mediaConnections.length > 0);

    return lease;
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CallParticipantLease>,
  ): CallParticipantLease {
    return new CallParticipantLease(
      new IdentityId(primitives.participantIdentityId),
      new CallParticipantLeaseRoute(
        new CallId(primitives.callId),
        new NodeId(primitives.ownerNodeId),
        new NetworkId(primitives.networkId),
        primitives.participantIds.map(
          (participantId) => new IdentityId(participantId),
        ),
      ),
      CallParticipantConnectionStatus.fromPrimitives(primitives.status),
      new Timestamp(primitives.lastHeartbeatAt),
      primitives.mediaConnections.map((connection) =>
        CallParticipantMediaConnection.fromPrimitives(connection),
      ),
      primitives.leftAt === undefined
        ? undefined
        : new Timestamp(primitives.leftAt),
      primitives.lastRenewedAt === undefined
        ? undefined
        : new Timestamp(primitives.lastRenewedAt),
    );
  }

  constructor(
    private readonly participantIdentityId: IdentityId,
    private route: CallParticipantLeaseRoute,
    private status: CallParticipantConnectionStatus,
    private lastHeartbeatAt: Timestamp,
    private mediaConnections: CallParticipantMediaConnection[],
    private leftAt?: Timestamp,
    private lastRenewedAt?: Timestamp,
  ) {
    super();
    this.lastRenewedAt ??= status.isConnected() ? lastHeartbeatAt : undefined;
  }

  private aggregateId(): string {
    return this.route.leaseIdFor(this.participantIdentityId);
  }

  private assertMediaConnectionsAreValid(
    mediaConnections: CallParticipantMediaConnection[],
  ): void {
    const remoteIdentityIds = mediaConnections.map((connection) =>
      connection.getRemoteIdentityId(),
    );
    const uniqueRemoteIdentityIds = remoteIdentityIds.filter(
      (remoteIdentityId, index) =>
        remoteIdentityIds.findIndex((candidate) =>
          candidate.isEqual(remoteIdentityId),
        ) === index,
    );
    const allTargetOtherParticipants = mediaConnections.every(
      (connection) =>
        !connection.isFor(this.participantIdentityId) &&
        this.route.hasParticipant(connection.getRemoteIdentityId()),
    );

    assert(
      allTargetOtherParticipants &&
        uniqueRemoteIdentityIds.length === mediaConnections.length,
      new InvalidCallParticipantMediaConnectionError(),
    );
  }

  private hasSameMediaConnections(
    mediaConnections: CallParticipantMediaConnection[],
  ): boolean {
    return (
      this.mediaConnections.length === mediaConnections.length &&
      mediaConnections.every((connection) =>
        this.mediaConnections.some((current) => current.isEqual(connection)),
      )
    );
  }

  private recordUpdated(
    connectionChanged: boolean,
    mediaConnectionsChanged: boolean,
    participantsChanged = false,
  ): void {
    const primitives = this.toPrimitives();

    this.record(
      new CallParticipantLeaseWasUpdatedEvent(this.aggregateId(), {
        ...primitives,
        connectionChanged,
        mediaConnectionsChanged,
        participantsChanged,
      }),
    );
  }

  private synchronizeParticipants(participantIds: IdentityId[]): boolean {
    if (this.route.includesAllParticipants(participantIds)) {
      return false;
    }

    this.route = this.route.withParticipants(participantIds);

    return true;
  }

  private replaceMediaConnections(
    mediaConnections: CallParticipantMediaConnection[],
  ): boolean {
    this.assertMediaConnectionsAreValid(mediaConnections);

    if (this.hasSameMediaConnections(mediaConnections)) {
      return false;
    }

    this.mediaConnections = [...mediaConnections];

    return true;
  }

  public belongsTo(
    participantIdentityId: IdentityId,
    ownerNodeId?: NodeId,
  ): boolean {
    return (
      this.participantIdentityId.isEqual(participantIdentityId) &&
      (!ownerNodeId || this.route.belongsToNode(ownerNodeId))
    );
  }

  public belongsToNode(nodeId: NodeId): boolean {
    return this.route.belongsToNode(nodeId);
  }

  public belongsToCall(callId: CallId): boolean {
    return this.route.belongsToCall(callId);
  }

  public disconnect(now: Timestamp = Timestamp.now()): boolean {
    if (!this.status.isConnected()) {
      return false;
    }

    const mediaConnectionsChanged = this.mediaConnections.length > 0;

    this.status = CallParticipantConnectionStatus.DISCONNECTED;
    this.lastHeartbeatAt = now;
    this.mediaConnections = [];
    this.recordUpdated(true, mediaConnectionsChanged);

    return true;
  }

  public leave(now: Timestamp = Timestamp.now()): boolean {
    if (this.leftAt) return false;

    const transitionAt = new Timestamp(
      Math.max(now.valueOf(), this.lastHeartbeatAt.valueOf() + 1),
    );
    this.leftAt = transitionAt;

    if (!this.disconnect(transitionAt)) {
      this.lastHeartbeatAt = transitionAt;
      this.recordUpdated(true, false);
    }

    return true;
  }

  public hasParticipationGrant(): boolean {
    const renewedAt = this.lastRenewedAt?.valueOf();

    if (renewedAt === undefined) return false;

    return (
      this.leftAt === undefined &&
      this.isWithinRetention() &&
      renewedAt > Date.now() - CallParticipantLease.RETENTION_MS &&
      renewedAt <= Date.now() + CallParticipantLease.CLOCK_SKEW_MS
    );
  }

  public isWithinRetention(now: number = Date.now()): boolean {
    const heartbeat = this.lastHeartbeatAt.valueOf();

    return (
      heartbeat > now - CallParticipantLease.RETENTION_MS &&
      heartbeat <= now + CallParticipantLease.CLOCK_SKEW_MS
    );
  }

  public getParticipantIdentityId(): IdentityId {
    return this.participantIdentityId;
  }

  public getLastHeartbeatAt(): Timestamp {
    return this.lastHeartbeatAt;
  }

  public getMediaConnections(): CallParticipantMediaConnection[] {
    return [...this.mediaConnections];
  }

  public hasTimedOut(threshold: Timestamp): boolean {
    return (
      this.status.isConnected() &&
      this.lastHeartbeatAt.isBeforeOrEqual(threshold)
    );
  }

  public isConnected(): boolean {
    return this.status.isConnected();
  }

  public renew(
    participantIds: IdentityId[],
    mediaConnections: CallParticipantMediaConnection[] = [],
    now: Timestamp = Timestamp.now(),
  ): void {
    const connectionChanged = !this.status.isConnected();
    this.leftAt = undefined;
    const participantsChanged = this.synchronizeParticipants(participantIds);
    const mediaConnectionsChanged =
      this.replaceMediaConnections(mediaConnections);

    this.status = CallParticipantConnectionStatus.CONNECTED;
    this.lastRenewedAt = now;
    this.lastHeartbeatAt = now;
    this.recordUpdated(
      connectionChanged,
      mediaConnectionsChanged,
      participantsChanged,
    );
  }

  public toPrimitives() {
    return {
      ...this.route.toPrimitives(),
      lastHeartbeatAt: this.lastHeartbeatAt.valueOf(),
      ...(this.lastRenewedAt
        ? { lastRenewedAt: this.lastRenewedAt.valueOf() }
        : {}),
      ...(this.leftAt ? { leftAt: this.leftAt.valueOf() } : {}),
      mediaConnections: this.mediaConnections.map((connection) =>
        connection.toPrimitives(),
      ),
      participantIdentityId: this.participantIdentityId.valueOf(),
      status: this.status.valueOf(),
    };
  }
}
