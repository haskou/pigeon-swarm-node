import IPFSContentReplicationNetworkSyncResponder from '@app/contexts/ipfs-replication/application/respond-network-sync/IPFSContentReplicationNetworkSyncResponder';
import { IPFSContentReplicationNetworkSyncResponseMessage } from '@app/contexts/ipfs-replication/application/respond-network-sync/messages/IPFSContentReplicationNetworkSyncResponseMessage';
import { IPFSContentReplicationNetworkSyncRequestedEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationNetworkSyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

// eslint-disable-next-line max-len
export default class RespondToIPFSContentReplicationNetworkSyncRequest extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.respond-to-ipfs-content-replication-network-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: IPFSContentReplicationNetworkSyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToIPFSContentReplicationNetworkSyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return IPFSContentReplicationNetworkSyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IPFSContentReplicationNetworkSyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new IPFSContentReplicationNetworkSyncResponseMessage(
        String(event.attributes.networkId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
