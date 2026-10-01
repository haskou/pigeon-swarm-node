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
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export default class CommunityChannelMessagePinMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['channelId', 'communityId', 'id', 'messageId', 'pinnedByIdentityId'],
    ['createdAt'],
    'community_channel',
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  public readonly collection = 'pins';

  constructor(private readonly communityRepository: CommunityRepository) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const communityId = new CommunityId(record.communityId as string);
    const channelId = new CommunityChannelId(record.channelId as string);
    const messageId = new CommunityChannelMessageId(record.messageId as string);
    const id = `community:${communityId.valueOf()}:${channelId.valueOf()}:${messageId.valueOf()}`;

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
    const community = await this.communities.get(
      record.communityId as string,
      () =>
        this.communityRepository.findById(
          new CommunityId(record.communityId as string),
        ),
    );

    if (!community) throw new InvalidPublicMutationError();
    community.manageChannelMessages(
      new IdentityId(authorIdentityId),
      new CommunityChannelId(record.channelId as string),
    );
  }
}
