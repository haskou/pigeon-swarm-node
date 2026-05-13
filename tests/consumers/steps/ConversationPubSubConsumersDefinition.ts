import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/conversations/RegisterMessagesWhenSyncAvailable';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import RespondToConversationSyncRequest from '@app/apps/consumers/pubsub/conversations/RespondToConversationSyncRequest';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import ConversationSyncResponder from '@app/contexts/conversations/application/respond-sync/ConversationSyncResponder';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import { ConversationSyncRequestedEvent } from '@app/contexts/conversations/domain/events/ConversationSyncRequestedEvent';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

@binding()
export default class ConversationPubSubConsumersDefinition extends PubSubConsumerTestContext {
  private readonly conversationId =
    'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de';

  private readonly messageId = '507f1f77bcf86cd799439011';

  private readonly networkId = '123e4567-e89b-12d3-a456-426614174000';

  private readonly readerIdentityId =
    'MCowBQYDK2VwAyEAeLMrMAfBRHdSU4eI1qpIUsqyfkXtR4FGjLhFzaWlfsI=';

  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
  }

  @when('the message sent consumer handles a message announcement')
  public async messageSentConsumerHandlesAMessageAnnouncement(): Promise<void> {
    const consumer = new RegisterMessageWhenAnnounced(
      this.eventConsumer(),
      this.fakeUseCase<ConversationMessageRegistrar>('register'),
    );

    await consumer.handler(
      new ConversationMessageWasSentEvent(this.conversationId, {
        messageId: this.messageId,
      }),
    );
  }

  @when('the message edited consumer handles a message announcement')
  public async messageEditedConsumerHandlesAMessageAnnouncement(): Promise<void> {
    const consumer = new RegisterMessageEditionWhenAnnounced(
      this.eventConsumer(),
      this.fakeUseCase<ConversationMessageRegistrar>('register'),
    );

    await consumer.handler(
      new ConversationMessageWasEditedEvent(this.conversationId, {
        messageId: this.messageId,
      }),
    );
  }

  @when('the message deleted consumer handles a message announcement')
  public async messageDeletedConsumerHandlesAMessageAnnouncement(): Promise<void> {
    const consumer = new RegisterMessageDeletionWhenAnnounced(
      this.eventConsumer(),
      this.fakeUseCase<ConversationMessageRegistrar>('register'),
    );

    await consumer.handler(
      new ConversationMessageWasDeletedEvent(this.conversationId, {
        messageId: this.messageId,
      }),
    );
  }

  @when('the conversation sync request consumer handles a sync request')
  public async conversationSyncRequestConsumerHandlesASyncRequest(): Promise<void> {
    const consumer = new RespondToConversationSyncRequest(
      this.eventConsumer(),
      this.fakeUseCase<ConversationSyncResponder>('respond'),
    );

    await consumer.handler(
      new ConversationSyncRequestedEvent(this.conversationId, {
        networkId: this.networkId,
        requestId: this.requestId,
      }),
    );
  }

  @when('the conversation sync available consumer handles a sync response')
  public async conversationSyncAvailableConsumerHandlesASyncResponse(): Promise<void> {
    const consumer = new RegisterMessagesWhenSyncAvailable(
      this.eventConsumer(),
      this.fakeUseCase<ConversationMessageRegistrar>('register'),
      this.suppressionTracker as unknown as SyncResponseSuppressionTracker,
    );

    await consumer.handler(
      new ConversationSyncAvailableEvent(this.conversationId, {
        messageCandidates: [
          { messageId: this.messageId },
          { messageId: 123 },
          null,
        ],
        requestId: this.requestId,
      }),
    );
  }

  @when('the messages read consumer handles a read announcement')
  public async messagesReadConsumerHandlesAReadAnnouncement(): Promise<void> {
    const consumer = new MarkMessagesReadWhenAnnounced(
      this.eventConsumer(),
      this.fakeUseCase<MessagesReadRegistrar>('register'),
    );

    await consumer.handler(
      new ConversationMessagesWereReadEvent(this.conversationId, {
        messageId: this.messageId,
        readerIdentityId: this.readerIdentityId,
      }),
    );
  }

  @then('the conversation message registrar should receive that message')
  public conversationMessageRegistrarShouldReceiveThatMessage(): void {
    const message = this.lastMessage<{
      conversationId: { valueOf(): string };
      messageId: { valueOf(): string };
    }>();

    expect(message.conversationId.valueOf()).to.equal(this.conversationId);
    expect(message.messageId.valueOf()).to.equal(this.messageId);
  }

  @then('the conversation sync responder should receive that request')
  public conversationSyncResponderShouldReceiveThatRequest(): void {
    const message = this.lastMessage<{
      conversationId: { valueOf(): string };
      networkId: { valueOf(): string };
      requestId?: { valueOf(): string };
    }>();

    expect(message.conversationId.valueOf()).to.equal(this.conversationId);
    expect(message.networkId.valueOf()).to.equal(this.networkId);
    expect(message.requestId?.valueOf()).to.equal(this.requestId);
  }

  @then('the conversation message registrar should receive the valid sync messages')
  public conversationMessageRegistrarShouldReceiveTheValidSyncMessages(): void {
    expect(this.calls).to.have.length(1);
    this.conversationMessageRegistrarShouldReceiveThatMessage();
    expect(this.suppressionTracker.available).to.deep.equal([
      {
        aggregateId: this.conversationId,
        requestId: this.requestId,
        type: 'conversation',
      },
    ]);
  }

  @then('the messages read registrar should receive that read marker')
  public messagesReadRegistrarShouldReceiveThatReadMarker(): void {
    const message = this.lastMessage<{
      conversationId: { valueOf(): string };
      messageId: { valueOf(): string };
      readerIdentityId: { valueOf(): string };
    }>();

    expect(message.conversationId.valueOf()).to.equal(this.conversationId);
    expect(message.messageId.valueOf()).to.equal(this.messageId);
    expect(message.readerIdentityId.valueOf()).to.equal(this.readerIdentityId);
  }
}
