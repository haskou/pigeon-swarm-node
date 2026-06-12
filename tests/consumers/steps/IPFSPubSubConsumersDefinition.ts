import RegisterContentReplicaClaimWhenClaimed from '@app/apps/consumers/pubsub/ipfs/RegisterContentReplicaClaimWhenClaimed';
import ContentReplicaClaimRegistrar from '@app/contexts/content-replication/application/register-claim/ContentReplicaClaimRegistrar';
import { ContentReplicationWasClaimedEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasClaimedEvent';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

type RegisteredReplicaClaim = {
  cid: string;
  claimedAt?: number;
  networkId: string;
  nodeId: string;
};

class FakeContentReplicaClaimRegistrar {
  public registeredClaims: RegisteredReplicaClaim[] = [];

  public async register(params: RegisteredReplicaClaim): Promise<void> {
    this.registeredClaims.push(params);
  }
}

@binding()
export default class IPFSPubSubConsumersDefinition extends PubSubConsumerTestContext {
  private readonly claimedAt = 1778536870557;
  private readonly cid = 'bafy-content';
  private readonly networkId = '550e8400-e29b-41d4-a716-446655440001';
  private readonly nodeId = '550e8400-e29b-41d4-a716-446655440010';

  private registrar = new FakeContentReplicaClaimRegistrar();

  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
    this.registrar = new FakeContentReplicaClaimRegistrar();
  }

  @when(
    'the IPFS content replica claimed consumer handles a replica claim',
  )
  public async ipfsReplicaClaimedConsumerHandlesAReplicaClaim(): Promise<void> {
    const consumer = new RegisterContentReplicaClaimWhenClaimed(
      this.eventConsumer(),
      this.registrar as unknown as ContentReplicaClaimRegistrar,
    );

    await consumer.handler(
      new ContentReplicationWasClaimedEvent(this.cid, {
        cid: this.cid,
        claimedAt: this.claimedAt,
        networkId: this.networkId,
        nodeId: this.nodeId,
      }),
    );
  }

  @then(
    'the IPFS content replica claim registrar should receive that claim',
  )
  public ipfsContentReplicaClaimRegistrarShouldReceiveThatClaim(): void {
    expect(this.registrar.registeredClaims).to.deep.equal([
      {
        cid: this.cid,
        claimedAt: this.claimedAt,
        networkId: this.networkId,
        nodeId: this.nodeId,
      },
    ]);
  }
}
