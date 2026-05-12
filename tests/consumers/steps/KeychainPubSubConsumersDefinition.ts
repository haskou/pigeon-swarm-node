import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import RegisterKeychainWhenSyncAvailable from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenSyncAvailable';
import RespondToKeychainSyncRequest from '@app/apps/consumers/pubsub/keychains/RespondToKeychainSyncRequest';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import KeychainCandidateRegistrar from '@app/contexts/keychains/application/register-candidate/KeychainCandidateRegistrar';
import KeychainSyncResponder from '@app/contexts/keychains/application/respond-sync/KeychainSyncResponder';
import { KeychainSyncAvailableEvent } from '@app/contexts/keychains/domain/events/KeychainSyncAvailableEvent';
import { KeychainSyncRequestedEvent } from '@app/contexts/keychains/domain/events/KeychainSyncRequestedEvent';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

@binding()
export default class KeychainPubSubConsumersDefinition extends PubSubConsumerTestContext {
  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
  }

  @when('the keychain published consumer handles a keychain publication')
  public async keychainPublishedConsumerHandlesAKeychainPublication(): Promise<void> {
    const consumer = new RegisterKeychainWhenPublished(
      this.eventConsumer(),
      this.fakeUseCase<CurrentKeychainFinder>('find'),
    );

    await consumer.handler(new KeychainWasPublishedEvent(this.ownerIdentityId()));
  }

  @when('the keychain updated consumer handles a keychain publication')
  public async keychainUpdatedConsumerHandlesAKeychainPublication(): Promise<void> {
    const consumer = new SynchronizeKeychainWhenUpdated(
      this.eventConsumer(),
      this.fakeUseCase<CurrentKeychainFinder>('find'),
    );

    await consumer.handler(new KeychainWasPublishedEvent(this.ownerIdentityId()));
  }

  @when('the keychain sync request consumer handles a sync request')
  public async keychainSyncRequestConsumerHandlesASyncRequest(): Promise<void> {
    const consumer = new RespondToKeychainSyncRequest(
      this.eventConsumer(),
      this.fakeUseCase<KeychainSyncResponder>('respond'),
    );

    await consumer.handler(
      new KeychainSyncRequestedEvent(this.ownerIdentityId(), {
        requestId: this.requestId,
      }),
    );
  }

  @when('the keychain sync available consumer handles a sync response')
  public async keychainSyncAvailableConsumerHandlesASyncResponse(): Promise<void> {
    const consumer = new RegisterKeychainWhenSyncAvailable(
      this.eventConsumer(),
      this.fakeUseCase<KeychainCandidateRegistrar>('register'),
      this.suppressionTracker as unknown as SyncResponseSuppressionTracker,
    );

    await consumer.handler(
      new KeychainSyncAvailableEvent(this.ownerIdentityId(), {
        externalIdentifier: this.externalIdentifier,
        requestId: this.requestId,
      }),
    );
  }

  @then('the current keychain finder should receive the owner identity')
  public currentKeychainFinderShouldReceiveTheOwnerIdentity(): void {
    const message = this.lastMessage<{
      ownerIdentityId: { valueOf(): string };
    }>();

    expect(message.ownerIdentityId.valueOf()).to.equal(this.ownerIdentityId());
  }

  @then('the keychain sync responder should receive that request')
  public keychainSyncResponderShouldReceiveThatRequest(): void {
    const message = this.lastMessage<{
      ownerIdentityId: { valueOf(): string };
      requestId?: string;
    }>();

    expect(message.ownerIdentityId.valueOf()).to.equal(this.ownerIdentityId());
    expect(message.requestId).to.equal(this.requestId);
  }

  @then('the keychain candidate registrar should receive the external identifier')
  public keychainCandidateRegistrarShouldReceiveTheExternalIdentifier(): void {
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
        type: 'keychain',
      },
    ]);
  }
}
