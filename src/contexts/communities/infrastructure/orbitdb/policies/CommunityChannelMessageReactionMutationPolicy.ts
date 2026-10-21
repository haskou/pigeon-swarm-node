import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationPendingError } from '@app/contexts/public-mutations/domain/errors/PublicMutationPendingError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
import { CommunityNotFoundError } from '../../../domain/errors/CommunityNotFoundError';
import { CommunityOperationParentsMissingError } from '../../../domain/errors/CommunityOperationParentsMissingError';
import CommunityRepository from '../../../domain/repositories/CommunityRepository';
import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '../../../domain/value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export default class CommunityChannelMessageReactionMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    [
      'authorIdentityId',
      'channelId',
      'communityId',
      'emoji',
      'id',
      'messageId',
    ],
    ['createdAt'],
    'community_channel',
  );

  private readonly communities = new ShortLivedLookup<Community>();

  public readonly collection = 'reactions';

  public readonly scopeType = 'community_channel';

  public readonly requiresFrontier = true;

  constructor(private readonly communityRepository: CommunityRepository) {
    super();
  }

  private async findCommunity(
    record: Record<string, unknown>,
    frontier: string[],
  ): Promise<Community> {
    const communityId = record.communityId as string;

    return this.communities
      .get(PublicMutationFrontier.keyOf(communityId, frontier), () =>
        this.communityRepository.requireAtFrontier(
          new CommunityId(communityId),
          frontier,
        ),
      )
      .catch((error: unknown) => {
        if (
          error instanceof CommunityNotFoundError ||
          error instanceof CommunityOperationParentsMissingError
        ) {
          throw new PublicMutationPendingError();
        }

        throw error;
      });
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const id = [
      'community_channel',
      new CommunityId(record.communityId as string).valueOf(),
      new CommunityChannelId(record.channelId as string).valueOf(),
      new CommunityChannelMessageId(record.messageId as string).valueOf(),
      new IdentityId(record.authorIdentityId as string).valueOf(),
      new CommunityChannelMessageReactionEmoji(
        record.emoji as string,
      ).valueOf(),
    ].join(':');

    if (record.id !== id) throw new InvalidPublicMutationError();

    return {
      authorIdentityId: record.authorIdentityId as string,
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
    const community = await this.findCommunity(record, frontier);
    community.reactWithSticker(
      new IdentityId(authorIdentityId),
      new CommunityChannelId(record.channelId as string),
      new CommunityChannelMessageId(record.messageId as string),
      new CommunityChannelMessageReactionEmoji(record.emoji as string),
    );
  }
}
