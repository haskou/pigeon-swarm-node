import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Conversation } from '../../../domain/Conversation';
import ConversationRepository from '../../../domain/repositories/ConversationRepository';
import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export default class ConversationMessagePinMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['conversationId', 'id', 'messageId', 'pinnedByIdentityId'],
    ['createdAt'],
    'conversation',
  );

  private readonly conversations = new ShortLivedLookup<
    Conversation | undefined
  >();

  public readonly collection = 'pins';

  public readonly scopeType = 'conversation';

  constructor(private readonly conversationRepository: ConversationRepository) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const conversationId = new ConversationId(record.conversationId as string);
    const messageId = new MessageId(record.messageId as string);
    const id = `conversation:${conversationId.valueOf()}:${messageId.valueOf()}`;

    if (record.id !== id) throw new InvalidPublicMutationError();

    return {
      authorIdentityId: record.pinnedByIdentityId as string,
      recordId: id,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
  ): Promise<void> {
    const conversation = await this.conversations.get(
      record.conversationId as string,
      () =>
        this.conversationRepository.findMetadataById(
          new ConversationId(record.conversationId as string),
        ),
    );

    if (!conversation?.hasParticipant(new IdentityId(authorIdentityId))) {
      throw new InvalidPublicMutationError();
    }
  }
}
