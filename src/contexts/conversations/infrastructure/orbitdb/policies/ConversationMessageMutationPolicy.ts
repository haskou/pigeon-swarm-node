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
import { MessageType } from '../../../domain/value-objects/MessageType';

export default class ConversationMessageMutationPolicy extends PublicMutationPolicy {
  private static readonly REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
    [MessageType.DELETED.valueOf()]: ['targetMessageId'],
    [MessageType.EDITED.valueOf()]: ['encryptedPayload', 'targetMessageId'],
    [MessageType.POLL.valueOf()]: ['pollId'],
    [MessageType.SENT.valueOf()]: ['encryptedPayload'],
  };

  private readonly shape = new PublicMutationRecordShape(
    ['authorId', 'conversationId', 'id', 'type'],
    ['createdAt'],
    'conversation',
    {
      arrays: ['previousMessageIds'],
      optionalStrings: [
        'encryptedPayload',
        'pollId',
        'replyToMessageId',
        'targetMessageId',
      ],
    },
  );

  private readonly conversations = new ShortLivedLookup<
    Conversation | undefined
  >();

  public readonly collection = 'messages';

  public readonly scopeType = 'conversation';

  public readonly requiresFrontier = true;

  constructor(private readonly conversationRepository: ConversationRepository) {
    super();
  }

  private assertFieldsMatchType(record: Record<string, unknown>): void {
    const required =
      ConversationMessageMutationPolicy.REQUIRED_FIELDS_BY_TYPE[
        record.type as string
      ];

    if (!required) throw new InvalidPublicMutationError();

    if (
      !(record.previousMessageIds as unknown[]).every(
        (item) => typeof item === 'string',
      )
    ) {
      throw new InvalidPublicMutationError();
    }

    for (const field of required) {
      if (typeof record[field] !== 'string') {
        throw new InvalidPublicMutationError();
      }
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);
    this.assertFieldsMatchType(record);

    const id = new MessageId(record.id as string).valueOf();

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
