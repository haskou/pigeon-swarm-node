import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

@binding()
export default class KeychainPubSubConsumersDefinition extends PubSubConsumerTestContext {
  private handlerError: unknown;

  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
    this.handlerError = undefined;
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

  @when('the keychain published consumer handles a publication whose keychain is not resolvable yet')
  public async keychainPublishedConsumerHandlesAnUnresolvedPublication(): Promise<void> {
    const consumer = new RegisterKeychainWhenPublished(
      this.eventConsumer(),
      this.failingFinder(
        new KeychainNotFoundError(new IdentityId(this.ownerIdentityId())),
      ),
    );

    await this.captureHandlerError(() =>
      consumer.handler(new KeychainWasPublishedEvent(this.ownerIdentityId())),
    );
  }

  @when('the keychain updated consumer handles a publication whose keychain is not resolvable yet')
  public async keychainUpdatedConsumerHandlesAnUnresolvedPublication(): Promise<void> {
    const consumer = new SynchronizeKeychainWhenUpdated(
      this.eventConsumer(),
      this.failingFinder(
        new KeychainNotFoundError(new IdentityId(this.ownerIdentityId())),
      ),
    );

    await this.captureHandlerError(() =>
      consumer.handler(new KeychainWasPublishedEvent(this.ownerIdentityId())),
    );
  }

  @when('the keychain published consumer handles a publication whose lookup fails unexpectedly')
  public async keychainPublishedConsumerHandlesAnUnexpectedFailure(): Promise<void> {
    const consumer = new RegisterKeychainWhenPublished(
      this.eventConsumer(),
      this.failingFinder(new Error('Unexpected lookup failure.')),
    );

    await this.captureHandlerError(() =>
      consumer.handler(new KeychainWasPublishedEvent(this.ownerIdentityId())),
    );
  }

  @then('the consumer handler should complete without a failure')
  public consumerHandlerShouldCompleteWithoutAFailure(): void {
    expect(this.handlerError).to.equal(undefined);
  }

  @then('the consumer handler should fail with the lookup error')
  public consumerHandlerShouldFailWithTheLookupError(): void {
    expect(this.handlerError).to.be.instanceOf(Error);
    expect((this.handlerError as Error).message).to.equal(
      'Unexpected lookup failure.',
    );
  }

  private failingFinder(error: Error): CurrentKeychainFinder {
    return {
      find: (): Promise<never> => Promise.reject(error),
    } as unknown as CurrentKeychainFinder;
  }

  private async captureHandlerError(
    handle: () => Promise<void>,
  ): Promise<void> {
    try {
      await handle();
    } catch (error: unknown) {
      this.handlerError = error;
    }
  }

}
