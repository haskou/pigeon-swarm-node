import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
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

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  public readonly collection = 'reactions';

  public readonly scopeType = 'community_channel';

  constructor(private readonly communityRepository: CommunityRepository) {
    super();
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
  ): Promise<void> {
    const community = await this.communities.get(
      record.communityId as string,
      () =>
        this.communityRepository.findById(
          new CommunityId(record.communityId as string),
        ),
    );

    if (!community) throw new InvalidPublicMutationError();
    community.reactWithSticker(
      new IdentityId(authorIdentityId),
      new CommunityChannelId(record.channelId as string),
      new CommunityChannelMessageId(record.messageId as string),
      new CommunityChannelMessageReactionEmoji(record.emoji as string),
    );
  }
}
