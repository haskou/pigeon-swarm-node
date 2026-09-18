import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallParticipantLeaseWasUpdatedEvent } from '@app/contexts/calls/domain/events/CallParticipantLeaseWasUpdatedEvent';
import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class RegisterCallParticipantLeaseWhenUpdated extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-call-participant-lease-when-updated';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly repository: CallParticipantLeaseRepository,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterCallParticipantLeaseWhenUpdated.QUEUE_NAME;
  }

  public get eventName(): string {
    return CallParticipantLeaseWasUpdatedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CallParticipantLeaseWasUpdatedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  private mediaConnectionsFrom(value: unknown): Array<{
    localCandidateType?: string;
    protocol?: string;
    relayProtocol?: string;
    relayUrl?: string;
    remoteCandidateType?: string;
    remoteIdentityId: string;
    state: string;
  }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (connection): connection is Record<string, unknown> =>
          typeof connection === 'object' && connection !== null,
      )
      .map((connection) => ({
        ...(typeof connection.localCandidateType === 'string'
          ? { localCandidateType: connection.localCandidateType }
          : {}),
        ...(typeof connection.protocol === 'string'
          ? { protocol: connection.protocol }
          : {}),
        ...(typeof connection.relayProtocol === 'string'
          ? { relayProtocol: connection.relayProtocol }
          : {}),
        ...(typeof connection.relayUrl === 'string'
          ? { relayUrl: connection.relayUrl }
          : {}),
        ...(typeof connection.remoteCandidateType === 'string'
          ? { remoteCandidateType: connection.remoteCandidateType }
          : {}),
        remoteIdentityId: String(connection.remoteIdentityId),
        state: String(connection.state),
      }));
  }

  public async handler(event: DomainEvent): Promise<void> {
    const lease = CallParticipantLease.fromPrimitives({
      callId: String(event.attributes.callId),
      lastHeartbeatAt: Number(event.attributes.lastHeartbeatAt),
      mediaConnections: this.mediaConnectionsFrom(
        event.attributes.mediaConnections,
      ),
      networkId: String(event.attributes.networkId),
      ownerNodeId: String(event.attributes.ownerNodeId),
      participantIdentityId: String(event.attributes.participantIdentityId),
      participantIds: Array.isArray(event.attributes.participantIds)
        ? event.attributes.participantIds.filter(
            (participantId): participantId is string =>
              typeof participantId === 'string',
          )
        : [],
      status: String(event.attributes.status),
    });
    const callId = new CallId(String(event.attributes.callId));
    const before = await this.repository.findByCallIds([callId]);
    const previous = before.find((candidate) =>
      candidate.belongsTo(
        new IdentityId(String(event.attributes.participantIdentityId)),
        new NodeId(String(event.attributes.ownerNodeId)),
      ),
    );
    await this.repository.save(lease);
    const after = await this.repository.findByCallIds([callId]);
    const current = after.find((candidate) =>
      candidate.belongsTo(
        new IdentityId(String(event.attributes.participantIdentityId)),
        new NodeId(String(event.attributes.ownerNodeId)),
      ),
    );

    if (
      (previous?.isConnected() ?? false) !== (current?.isConnected() ?? false)
    ) {
      webSocketEventHub.publishCallSnapshot(
        callId.valueOf(),
        lease.toPrimitives().participantIds,
      );
    }
  }
}
