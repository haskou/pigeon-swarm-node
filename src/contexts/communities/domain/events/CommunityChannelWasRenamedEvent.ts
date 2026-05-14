import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityChannelWasRenamedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.channel.was_renamed';

  public eventName(): string {
    return CommunityChannelWasRenamedEvent.EVENT_NAME;
  }
}
