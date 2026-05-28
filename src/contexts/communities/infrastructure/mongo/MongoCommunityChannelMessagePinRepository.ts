import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { MongoCommunityChannelMessagePinDocument } from './documents/MongoCommunityChannelMessagePinDocument';

export class MongoCommunityChannelMessagePinRepository {
  private static readonly COLLECTION = 'community_channel_message_pins';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCommunityChannelMessagePinDocument>(
      MongoCommunityChannelMessagePinRepository.COLLECTION,
    );
  }

  private pinId(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): string {
    return `${communityId.valueOf()}:${channelId.valueOf()}:${messageId.valueOf()}`;
  }

  public async pin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document: MongoCommunityChannelMessagePinDocument = {
      _id: this.pinId(communityId, channelId, messageId),
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      createdAt: createdAt.valueOf(),
      messageId: messageId.valueOf(),
      pinnedByIdentityId: pinnedByIdentityId.valueOf(),
    };

    await (
      await this.collection()
    ).updateOne(
      { _id: document._id },
      { $setOnInsert: document },
      { upsert: true },
    );
  }

  public async unpin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({ _id: this.pinId(communityId, channelId, messageId) });
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<MongoCommunityChannelMessagePinDocument[]> {
    return (await this.collection())
      .find({
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
      })
      .sort({ createdAt: -1 })
      .toArray();
  }
}
