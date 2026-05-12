import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import NodePeerRegistrar from '@app/contexts/nodes/application/register-peer/NodePeerRegistrar';
import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

@binding()
export default class NodePubSubConsumersDefinition extends PubSubConsumerTestContext {
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
        networks: [{ id: this.networkId, name: 'public' }],
        owner: this.ownerIdentityId(),
      }),
    );
  }

  @then('the node peer registrar should receive that peer')
  public nodePeerRegistrarShouldReceiveThatPeer(): void {
    const message = this.lastMessage<{
      networks: Array<{ toPrimitives(): { id: string; name: string } }>;
      nodeId: { valueOf(): string };
      owner?: { valueOf(): string };
    }>();

    expect(message.nodeId.valueOf()).to.equal(this.nodeId);
    expect(message.owner?.valueOf()).to.equal(this.ownerIdentityId());
    expect(message.networks[0].toPrimitives()).to.deep.equal({
      id: this.networkId,
      name: 'public',
    });
  }
}
