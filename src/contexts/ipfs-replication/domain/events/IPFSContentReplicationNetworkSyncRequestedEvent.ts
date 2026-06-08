import DomainEvent from '@app/shared/domain/events/DomainEvent';

// eslint-disable-next-line max-len
export class IPFSContentReplicationNetworkSyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME =
    'ipfs.v1.content.replication.network.sync_requested';

  public eventName(): string {
    return IPFSContentReplicationNetworkSyncRequestedEvent.EVENT_NAME;
  }
}
