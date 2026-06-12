import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessageReactionWhenAdded from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenAdded';
import RegisterMessageReactionWhenRemoved from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenRemoved';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import { ConversationMessageReactionWasRemovedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasRemovedEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

@binding()
export default class ConversationPubSubConsumersDefinition extends PubSubConsumerTestContext {
  private readonly conversationId =
    'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de';

  private readonly messageId = '507f1f77bcf86cd799439011';

  private readonly readerIdentityId =
    'MCowBQYDK2VwAyEAeLMrMAfBRHdSU4eI1qpIUsqyfkXtR4FGjLhFzaWlfsI=';

  private readonly reactionAuthorId =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';

  private readonly reactionCreatedAt = 1778513696020;

  private readonly reactionEmoji = '👍';

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

  @when('the message reaction added consumer handles a reaction announcement')
  public async messageReactionAddedConsumerHandlesAReactionAnnouncement(): Promise<void> {
    const consumer = new RegisterMessageReactionWhenAdded(
      this.eventConsumer(),
      this.fakeUseCase<MessageReactionRegistrar>('register'),
    );

    await consumer.handler(
      new ConversationMessageReactionWasAddedEvent(this.conversationId, {
        authorId: this.reactionAuthorId,
        createdAt: this.reactionCreatedAt,
        emoji: this.reactionEmoji,
        messageId: this.messageId,
      }),
    );
  }

  @when(
    'the message reaction removed consumer handles a reaction announcement',
  )
  public async messageReactionRemovedConsumerHandlesAReactionAnnouncement(): Promise<void> {
    const consumer = new RegisterMessageReactionWhenRemoved(
      this.eventConsumer(),
      this.fakeUseCase<MessageReactionRegistrar>('unregister'),
    );

    await consumer.handler(
      new ConversationMessageReactionWasRemovedEvent(this.conversationId, {
        authorId: this.reactionAuthorId,
        createdAt: this.reactionCreatedAt,
        emoji: this.reactionEmoji,
        messageId: this.messageId,
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

  @then(
    'the conversation message reaction registrar should receive that reaction',
  )
  public conversationMessageReactionRegistrarShouldReceiveThatReaction(): void {
    const message = this.lastMessage<{
      authorId: { valueOf(): string };
      conversationId: { valueOf(): string };
      createdAt: { valueOf(): number };
      emoji: { valueOf(): string };
      messageId: { valueOf(): string };
    }>();

    expect(message.conversationId.valueOf()).to.equal(this.conversationId);
    expect(message.messageId.valueOf()).to.equal(this.messageId);
    expect(message.authorId.valueOf()).to.equal(this.reactionAuthorId);
    expect(message.emoji.valueOf()).to.equal(this.reactionEmoji);
    expect(message.createdAt.valueOf()).to.equal(this.reactionCreatedAt);
  }

  @then(
    'the conversation message reaction registrar should remove that reaction',
  )
  public conversationMessageReactionRegistrarShouldRemoveThatReaction(): void {
    this.conversationMessageReactionRegistrarShouldReceiveThatReaction();
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
