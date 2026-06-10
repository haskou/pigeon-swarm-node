import IdentitySyncResponder from '@app/contexts/identities/application/respond-sync/IdentitySyncResponder';
import { IdentitySyncResponseMessage } from '@app/contexts/identities/application/respond-sync/messages/IdentitySyncResponseMessage';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToIdentitySyncRequest extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.respond-to-identity-sync-request';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly responder: IdentitySyncResponder,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RespondToIdentitySyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return IdentitySyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IdentitySyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.responder.respond(
      new IdentitySyncResponseMessage(
        String(event.attributes.identityId || event.aggregateId),
        event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      ),
    );
  }
}
