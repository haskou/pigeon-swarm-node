import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
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
      this.fakeUseCase<IdentityCandidateRegistrar>('register'),
    );

    await consumer.handler(
      new IdentityWasUpdatedEvent(this.ownerIdentityId(), {
        externalIdentifier: this.externalIdentifier,
      }),
    );
  }

  @then('the identity candidate registrar should receive that publication')
  public identityCandidateRegistrarShouldReceiveThatPublication(): void {
    const message = this.lastMessage<{
      externalIdentifier: { valueOf(): string };
      identityId: { valueOf(): string };
    }>();

    expect(message.identityId.valueOf()).to.equal(this.ownerIdentityId());
    expect(message.externalIdentifier.valueOf()).to.equal(
      this.externalIdentifier,
    );
  }
}
