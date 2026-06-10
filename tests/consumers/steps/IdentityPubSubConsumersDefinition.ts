import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

@binding()
export default class IdentityPubSubConsumersDefinition extends PubSubConsumerTestContext {
  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
  }

  @when('the identity updated consumer handles an identity update')
  public async identityUpdatedConsumerHandlesAnIdentityUpdate(): Promise<void> {
    const consumer = new SynchronizeIdentityWhenUpdated(
      this.eventConsumer(),
      this.fakeUseCase<RegisterPublishedIdentity>('register'),
    );

    await consumer.handler(new IdentityWasUpdatedEvent(this.ownerIdentityId()));
  }

  @then('the published identity registrar should receive that identity')
  public publishedIdentityRegistrarShouldReceiveThatIdentity(): void {
    const message = this.lastMessage<{
      identityId: { valueOf(): string };
    }>();

    expect(message.identityId.valueOf()).to.equal(this.ownerIdentityId());
  }

}
