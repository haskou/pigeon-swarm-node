import RecordPeerCommunityStateWhenAnnounced from '@app/apps/consumers/pubsub/nodes/RecordPeerCommunityStateWhenAnnounced';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import NodePeerCommunityStateRecorder from '@app/contexts/nodes/application/record-peer-community-state/NodePeerCommunityStateRecorder';
import NodePeerRegistrar from '@app/contexts/nodes/application/register-peer/NodePeerRegistrar';
import { NodeCommunityStateWasAnnounced } from '@app/contexts/nodes/domain/events/NodeCommunityStateWasAnnounced';
import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

@binding()
export default class NodePubSubConsumersDefinition extends PubSubConsumerTestContext {
  private readonly digest = 'A'.repeat(43);

  private readonly networkId = '123e4567-e89b-12d3-a456-426614174000';

  private readonly nodeId = '550e8400-e29b-41d4-a716-446655440010';

  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
  }

  @when('the node heartbeat consumer handles a heartbeat')
  public async nodeHeartbeatConsumerHandlesAHeartbeat(): Promise<void> {
    const consumer = new RegisterNodePeerWhenHeartbeatReceived(
      this.eventConsumer(),
      this.fakeUseCase<NodePeerRegistrar>('register'),
    );

    await consumer.handler(
      new NodeHeartbeatWasSent(this.nodeId, {
        networks: [{ id: this.networkId, name: 'public', type: 'public' }],
        owner: this.ownerIdentityId(),
      }),
    );
  }

  @then('the node peer registrar should receive that peer')
  public nodePeerRegistrarShouldReceiveThatPeer(): void {
    const message = this.lastMessage<{
      networks: Array<{
        toPrimitives(): { id: string; name: string; type?: string };
      }>;
      nodeId: { valueOf(): string };
      owner?: { valueOf(): string };
    }>();

    expect(message.nodeId.valueOf()).to.equal(this.nodeId);
    expect(message.owner?.valueOf()).to.equal(this.ownerIdentityId());
    expect(message.networks[0].toPrimitives()).to.deep.equal({
      id: this.networkId,
      name: 'public',
      type: 'public',
    });
  }

  @when('the node community state consumer handles an announcement')
  public async nodeCommunityStateConsumerHandlesAnAnnouncement(): Promise<void> {
    const consumer = new RecordPeerCommunityStateWhenAnnounced(
      this.eventConsumer(),
      this.fakeUseCase<NodePeerCommunityStateRecorder>('record'),
    );

    await consumer.handler(
      new NodeCommunityStateWasAnnounced('peer-1', {
        digest: this.digest,
        networkId: this.networkId,
      }),
    );
  }

  @then('the peer community state recorder should receive that announcement')
  public peerCommunityStateRecorderShouldReceiveThatAnnouncement(): void {
    const message = this.lastMessage<{
      digest: { valueOf(): string };
      networkId: { valueOf(): string };
      peerId: string;
    }>();

    expect(message.networkId.valueOf()).to.equal(this.networkId);
    expect(message.peerId).to.equal('peer-1');
    expect(message.digest.valueOf()).to.equal(this.digest);
  }
}
