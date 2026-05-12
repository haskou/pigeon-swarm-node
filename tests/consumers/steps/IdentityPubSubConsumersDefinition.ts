import RegisterIdentityWhenSyncAvailable from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenSyncAvailable';
import RespondToIdentitySyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentitySyncRequest';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import IdentitySyncResponder from '@app/contexts/identities/application/respond-sync/IdentitySyncResponder';
import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import { IdentitySyncRequestedEvent } from '@app/contexts/identities/domain/events/IdentitySyncRequestedEvent';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
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

  @when('the identity sync request consumer handles a sync request')
  public async identitySyncRequestConsumerHandlesASyncRequest(): Promise<void> {
    const consumer = new RespondToIdentitySyncRequest(
      this.eventConsumer(),
      this.fakeUseCase<IdentitySyncResponder>('respond'),
    );

    await consumer.handler(
      new IdentitySyncRequestedEvent(this.ownerIdentityId(), {
        requestId: this.requestId,
      }),
    );
  }

  @when('the identity sync available consumer handles a sync response')
  public async identitySyncAvailableConsumerHandlesASyncResponse(): Promise<void> {
    const consumer = new RegisterIdentityWhenSyncAvailable(
      this.eventConsumer(),
      this.fakeUseCase<IdentityCandidateRegistrar>('register'),
      this.suppressionTracker as unknown as SyncResponseSuppressionTracker,
    );

    await consumer.handler(
      new IdentitySyncAvailableEvent(this.ownerIdentityId(), {
        externalIdentifier: this.externalIdentifier,
        requestId: this.requestId,
      }),
    );
  }

  @then('the published identity registrar should receive that identity')
  public publishedIdentityRegistrarShouldReceiveThatIdentity(): void {
    const message = this.lastMessage<{
      identityId: { valueOf(): string };
    }>();

    expect(message.identityId.valueOf()).to.equal(this.ownerIdentityId());
  }

  @then('the identity sync responder should receive that request')
  public identitySyncResponderShouldReceiveThatRequest(): void {
    const message = this.lastMessage<{
      identityId: { valueOf(): string };
      requestId?: string;
    }>();

    expect(message.identityId.valueOf()).to.equal(this.ownerIdentityId());
    expect(message.requestId).to.equal(this.requestId);
  }

  @then('the identity candidate registrar should receive the external identifier')
  public identityCandidateRegistrarShouldReceiveTheExternalIdentifier(): void {
    const message = this.lastMessage<{
      externalIdentifier: { valueOf(): string };
    }>();

    expect(message.externalIdentifier.valueOf()).to.equal(
      this.externalIdentifier,
    );
    expect(this.suppressionTracker.available).to.deep.equal([
      {
        aggregateId: this.ownerIdentityId(),
        requestId: this.requestId,
        type: 'identity',
      },
    ]);
  }
}
