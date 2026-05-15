import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class IdentityNetworkSyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.network.sync_requested';

  public eventName(): string {
    return IdentityNetworkSyncRequestedEvent.EVENT_NAME;
  }
}
