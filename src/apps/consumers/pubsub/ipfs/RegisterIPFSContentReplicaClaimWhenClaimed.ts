import IPFSContentReplicaClaimRegistrar from '@app/contexts/ipfs-replication/application/register-claim/IPFSContentReplicaClaimRegistrar';
import { IPFSContentReplicationWasClaimedEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasClaimedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterIPFSReplicaClaimWhenClaimed extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-ipfs-content-replica-claim-when-claimed';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: IPFSContentReplicaClaimRegistrar,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterIPFSReplicaClaimWhenClaimed.QUEUE_NAME;
  }

  public get eventName(): string {
    return IPFSContentReplicationWasClaimedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IPFSContentReplicationWasClaimedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register({
      cid: String(event.attributes.cid),
      claimedAt: Number(event.attributes.claimedAt),
      networkId: String(event.attributes.networkId),
      nodeId: String(event.attributes.nodeId),
    });
  }
}
