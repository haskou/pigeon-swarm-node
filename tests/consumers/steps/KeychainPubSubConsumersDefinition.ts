import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
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

  @then('the current keychain finder should receive the owner identity')
  public currentKeychainFinderShouldReceiveTheOwnerIdentity(): void {
    const message = this.lastMessage<{
      ownerIdentityId: { valueOf(): string };
    }>();

    expect(message.ownerIdentityId.valueOf()).to.equal(this.ownerIdentityId());
  }

}
