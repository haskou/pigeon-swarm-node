import { NodePeerCommunityStateRecordMessage } from '@app/contexts/nodes/application/record-peer-community-state/messages/NodePeerCommunityStateRecordMessage';
import NodePeerCommunityStateRecorder from '@app/contexts/nodes/application/record-peer-community-state/NodePeerCommunityStateRecorder';
import { NodeCommunityStateWasAnnounced } from '@app/contexts/nodes/domain/events/NodeCommunityStateWasAnnounced';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class RecordPeerCommunityStateWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.record-peer-community-state-when-announced';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly recorder: NodePeerCommunityStateRecorder,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RecordPeerCommunityStateWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return NodeCommunityStateWasAnnounced.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return NodeCommunityStateWasAnnounced;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public handler(event: DomainEvent): Promise<void> {
    this.recorder.record(
      new NodePeerCommunityStateRecordMessage(
        String(event.attributes.networkId),
        String(event.aggregateId),
        String(event.attributes.digest),
      ),
    );

    return Promise.resolve();
  }
}
