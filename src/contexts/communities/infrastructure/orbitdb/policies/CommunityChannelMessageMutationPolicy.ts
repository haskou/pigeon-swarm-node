import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
import { CommunityChannelMessageRecordId } from '../../../domain/CommunityChannelMessageRecordId';
import { CommunityChannelMessage } from '../../../domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessagePayload } from '../../../domain/entities/messages/CommunityChannelMessagePayload';
import CommunityRepository from '../../../domain/repositories/CommunityRepository';
import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export default class CommunityChannelMessageMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['authorIdentityId', 'channelId', 'communityId', 'id', 'messageId'],
    ['createdAt'],
    'community_channel',
    {
      arrays: ['mentions'],
      optionalIntegers: ['editedAt'],
      optionalStrings: [
        'encryptedPayload',
        'plaintextPayload',
        'pollId',
        'replyToMessageId',
      ],
      putStrings: ['type'],
    },
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  public readonly collection = 'messages';

  public readonly scopeType = 'community_channel';

  public readonly requiresFrontier = true;

  constructor(private readonly communityRepository: CommunityRepository) {
    super();
  }

  private assertMentions(record: Record<string, unknown>): void {
    const mentions = record.mentions as unknown[];

    for (const mention of mentions) {
      const valid =
        typeof mention === 'object' &&
        mention !== null &&
        !Array.isArray(mention) &&
        typeof (mention as Record<string, unknown>).type === 'string' &&
        Object.keys(mention).every(
          (key) => key === 'type' || key === 'targetId',
        ) &&
        ['string', 'undefined'].includes(
          typeof (mention as Record<string, unknown>).targetId,
        );

      if (!valid) throw new InvalidPublicMutationError();
    }
  }

  private assertPutContent(record: Record<string, unknown>): void {
    const hasPayload =
      record.encryptedPayload !== undefined ||
      record.plaintextPayload !== undefined;
    const hasPoll = record.pollId !== undefined;
    const valid =
      record.type === 'poll'
        ? this.isPollContent(record, hasPoll, hasPayload)
        : record.type === 'sent' && !hasPoll && hasPayload;

    if (!valid) throw new InvalidPublicMutationError();
  }

  private isPollContent(
    record: Record<string, unknown>,
    hasPoll: boolean,
    hasPayload: boolean,
  ): boolean {
    return hasPoll && !hasPayload && record.editedAt === undefined;
  }

  private async findCommunity(
    record: Record<string, unknown>,
    frontier: string[],
  ): Promise<Community> {
    const communityId = record.communityId as string;
    const community = await this.communities.get(
      PublicMutationFrontier.keyOf(communityId, frontier),
      () =>
        this.communityRepository.findAtFrontier(
          new CommunityId(communityId),
          frontier,
        ),
    );

    if (!community) throw new InvalidPublicMutationError();

    return community;
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const id = CommunityChannelMessageRecordId.of(
      new CommunityId(record.communityId as string),
      new CommunityChannelId(record.channelId as string),
      new CommunityChannelMessageId(record.messageId as string),
      new IdentityId(record.authorIdentityId as string),
    );

    if (record.id !== id) throw new InvalidPublicMutationError();

    if (record.removed === true) {
      // A tombstone is signed by the author or by a moderator.
      return { recordId: id, store: this.collection };
    }

    this.assertMentions(record);
    this.assertPutContent(record);

    return {
      authorIdentityId: record.authorIdentityId as string,
      recordId: id,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
    frontier: string[],
  ): Promise<void> {
    const community = await this.findCommunity(record, frontier);
    const signer = new IdentityId(authorIdentityId);
    const channelId = new CommunityChannelId(record.channelId as string);

    if (isDeletion) {
      if (record.authorIdentityId === authorIdentityId) {
        community.viewTextChannel(signer, channelId);

        return;
      }

      community.manageChannelMessages(signer, channelId);

      return;
    }

    if (record.type === 'poll') {
      community.authorizeTextChannelPollCreation(signer, channelId);

      return;
    }

    community.acceptSentChannelMessage(
      CommunityChannelMessage.fromPrimitives({
        authorIdentityId,
        channelId: record.channelId as string,
        communityId: record.communityId as string,
        createdAt: record.createdAt as number,
        editedAt: record.editedAt as number | undefined,
        encryptedPayload: record.encryptedPayload as string | undefined,
        id: record.messageId as string,
        mentions: record.mentions as Array<{
          targetId: string | undefined;
          type: string;
        }>,
        plaintextPayload: record.plaintextPayload as string | undefined,
        pollId: undefined,
        replyToMessageId: record.replyToMessageId as string | undefined,
        type: 'sent',
      }),
      CommunityChannelMessagePayload.fromPrimitives({
        encryptedPayload: record.encryptedPayload as string | undefined,
        plaintextPayload: record.plaintextPayload as string | undefined,
      }),
    );
  }
}
