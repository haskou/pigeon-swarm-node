import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessagePin } from '../../domain/CommunityChannelMessagePin';
import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { OrbitDBCommunityChannelMessagePinDocument } from './documents/OrbitDBCommunityChannelMessagePinDocument';

export default class OrbitDBCommunityChannelMessagePinRepository extends CommunityChannelMessagePinRepository {
  private readonly pinIndex: OrbitDBHeadIndex<OrbitDBCommunityChannelMessagePinDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.pinIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'pins',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.freshness(current) <= this.freshness(candidate),
    });
  }

  private pinId(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): string {
    return `community:${communityId.valueOf()}:${channelId.valueOf()}:${messageId.valueOf()}`;
  }

  private indexHeadKey(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): string {
    return `community-channel-pin-index:${communityId.valueOf()}:${channelId.valueOf()}`;
  }

  private freshness(document: Record<string, unknown>): number {
    return Math.max(
      typeof document.updatedAt === 'number' ? document.updatedAt : 0,
      typeof document.createdAt === 'number' ? document.createdAt : 0,
    );
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

  private putIndexDocument(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    document: Record<string, unknown>,
  ): void {
    const key = this.indexHeadKey(communityId, channelId);

    void this.pinIndex.replicateRecordInBackground(
      key,
      {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        id: key,
      },
      document,
    );
  }

  private toPin(
    document: OrbitDBCommunityChannelMessagePinDocument,
  ): CommunityChannelMessagePin {
    return new CommunityChannelMessagePin(
      new CommunityChannelMessageId(document.messageId),
      new IdentityId(document.pinnedByIdentityId),
      new Timestamp(document.createdAt),
    );
  }

  public async pin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document = {
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      createdAt: createdAt.valueOf(),
      id: this.pinId(communityId, channelId, messageId),
      messageId: messageId.valueOf(),
      pinnedByIdentityId: pinnedByIdentityId.valueOf(),
      scopeType: 'community_channel',
    };

    await this.registry.putDocument('pins', document);
    this.putIndexDocument(communityId, channelId, document);
  }

  public async unpin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<void> {
    const document = {
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      id: this.pinId(communityId, channelId, messageId),
      messageId: messageId.valueOf(),
      removed: true,
      scopeType: 'community_channel',
      updatedAt: Date.now(),
    };

    await this.registry.putDocument('pins', document);
    this.putIndexDocument(communityId, channelId, document);
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CommunityChannelMessagePin[]> {
    const indexedDocuments = await this.pinIndex.find(
      this.indexHeadKey(communityId, channelId),
    );
    const documents = indexedDocuments ?? [];

    return documents
      .filter(
        (document): document is OrbitDBCommunityChannelMessagePinDocument =>
          this.isDocument(document),
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((document) => this.toPin(document));
  }
}
