import CommunitySyncResponder from '@app/contexts/communities/application/respond-sync/CommunitySyncResponder';
import { CommunitySyncResponseMessage } from '@app/contexts/communities/application/respond-sync/messages/CommunitySyncResponseMessage';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToCommunitySyncRequest extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.respond-to-community-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly responder: CommunitySyncResponder,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToCommunitySyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunitySyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunitySyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  private requestIdFrom(event: DomainEvent): string | undefined {
    return event.attributes.requestId
      ? String(event.attributes.requestId)
      : undefined;
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new CommunitySyncResponseMessage(
        String(event.attributes.communityId || event.aggregateId),
        String(event.attributes.networkId),
        this.requestIdFrom(event),
      ),
    );
  }
}
