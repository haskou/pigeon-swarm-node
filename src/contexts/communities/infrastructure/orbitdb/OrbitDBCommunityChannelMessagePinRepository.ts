import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
import { CommunityChannelMessagePin } from '../../domain/repositories/types/CommunityChannelMessagePin';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { OrbitDBCommunityChannelMessagePinDocument } from './documents/OrbitDBCommunityChannelMessagePinDocument';

// eslint-disable-next-line max-len
export default class OrbitDBCommunityChannelMessagePinRepository extends CommunityChannelMessagePinRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private pinId(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): string {
    return `community:${communityId.valueOf()}:${channelId.valueOf()}:${messageId.valueOf()}`;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCommunityChannelMessagePinDocument {
    return (
      document.removed !== true &&
      typeof document.id === 'string' &&
      typeof document.channelId === 'string' &&
      typeof document.communityId === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.messageId === 'string' &&
      typeof document.pinnedByIdentityId === 'string'
    );
  }

  private toPin(
    document: OrbitDBCommunityChannelMessagePinDocument,
  ): CommunityChannelMessagePin {
    return {
      createdAt: document.createdAt,
      messageId: document.messageId,
      pinnedByIdentityId: document.pinnedByIdentityId,
    };
  }

  public async pin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    await this.registry.putDocument('pins', {
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      createdAt: createdAt.valueOf(),
      id: this.pinId(communityId, channelId, messageId),
      messageId: messageId.valueOf(),
      pinnedByIdentityId: pinnedByIdentityId.valueOf(),
      scopeType: 'community_channel',
    });
  }

  public async unpin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<void> {
    await this.registry.putDocument('pins', {
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      id: this.pinId(communityId, channelId, messageId),
      messageId: messageId.valueOf(),
      removed: true,
      scopeType: 'community_channel',
      updatedAt: Date.now(),
    });
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CommunityChannelMessagePin[]> {
    const documents = await this.registry.queryDocuments(
      'pins',
      (document) =>
        document.scopeType === 'community_channel' &&
        document.communityId === communityId.valueOf() &&
        document.channelId === channelId.valueOf(),
    );

    return documents
      .filter(
        (document): document is OrbitDBCommunityChannelMessagePinDocument =>
          this.isDocument(document),
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((document) => this.toPin(document));
  }
}
