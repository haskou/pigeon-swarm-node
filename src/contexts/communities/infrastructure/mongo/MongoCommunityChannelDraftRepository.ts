import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { MongoCommunityChannelDraftDocument } from './documents/MongoCommunityChannelDraftDocument';

export class MongoCommunityChannelDraftRepository {
  private static readonly COLLECTION = 'community_channel_drafts';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCommunityChannelDraftDocument>(
      MongoCommunityChannelDraftRepository.COLLECTION,
    );
  }

  private draftId(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): string {
    return `${identityId.valueOf()}:${communityId.valueOf()}:${channelId.valueOf()}`;
  }

  public async save(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
    encryptedPayload: string,
    updatedAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document: MongoCommunityChannelDraftDocument = {
      _id: this.draftId(identityId, communityId, channelId),
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      encryptedPayload,
      identityId: identityId.valueOf(),
      updatedAt: updatedAt.valueOf(),
    };

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }

  public async delete(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({ _id: this.draftId(identityId, communityId, channelId) });
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<MongoCommunityChannelDraftDocument[]> {
    return (await this.collection())
      .find({ identityId: identityId.valueOf() })
      .sort({ updatedAt: -1 })
      .toArray();
  }
}
