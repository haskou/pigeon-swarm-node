import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Conversation } from '../../../domain/Conversation';
import ConversationRepository from '../../../domain/repositories/ConversationRepository';
import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageReactionEmoji } from '../../../domain/value-objects/MessageReactionEmoji';

export default class ConversationMessageReactionMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['authorId', 'conversationId', 'emoji', 'id', 'messageId'],
    ['createdAt'],
    'conversation',
  );

  private readonly conversations = new ShortLivedLookup<
    Conversation | undefined
  >();

  public readonly collection = 'reactions';

  public readonly scopeType = 'conversation';

  public readonly requiresFrontier = true;

  constructor(private readonly conversationRepository: ConversationRepository) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const id = [
      'conversation',
      new ConversationId(record.conversationId as string).valueOf(),
      new MessageId(record.messageId as string).valueOf(),
      new IdentityId(record.authorId as string).valueOf(),
      new MessageReactionEmoji(record.emoji as string).valueOf(),
    ].join(':');

    if (record.id !== id) throw new InvalidPublicMutationError();

    return {
      authorIdentityId: record.authorId as string,
      recordId: id,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    _isDeletion: boolean,
    frontier: string[],
  ): Promise<void> {
    const conversation = await this.conversations.get(
      PublicMutationFrontier.keyOf(record.conversationId as string, frontier),
      () =>
        this.conversationRepository.findMetadataAtFrontier(
          new ConversationId(record.conversationId as string),
          frontier,
        ),
    );

    if (!conversation?.hasParticipant(new IdentityId(authorIdentityId))) {
      throw new InvalidPublicMutationError();
    }
  }
}
