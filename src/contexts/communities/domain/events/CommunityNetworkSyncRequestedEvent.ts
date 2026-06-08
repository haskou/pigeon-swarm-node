import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CommunityNetworkSyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'communities.v1.network.sync_requested';

  public eventName(): string {
    return CommunityNetworkSyncRequestedEvent.EVENT_NAME;
  }
}
