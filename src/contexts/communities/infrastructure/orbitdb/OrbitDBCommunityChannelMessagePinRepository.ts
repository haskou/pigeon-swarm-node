import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessagePin } from '../../domain/CommunityChannelMessagePin';
import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityChannelMessagePinDocument } from './documents/OrbitDBCommunityChannelMessagePinDocument';

export default class OrbitDBCommunityChannelMessagePinRepository extends CommunityChannelMessagePinRepository {
  private readonly pinIndex: OrbitDBHeadIndex<OrbitDBCommunityChannelMessagePinDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
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
    return this.indexHeadKeyFromValues(
      communityId.valueOf(),
      channelId.valueOf(),
    );
  }

  private indexHeadKeyFromValues(
    communityId: string,
    channelId: string,
  ): string {
    return `community-channel-pin-index:${communityId}:${channelId}`;
  }

  private freshness(document: Record<string, unknown>): number {
    return Math.max(
      typeof document.updatedAt === 'number' ? document.updatedAt : 0,
      typeof document.createdAt === 'number' ? document.createdAt : 0,
    );
  }

  private hasRequiredFields(document: Record<string, unknown>): boolean {
    const stringFields = [
      'channelId',
      'communityId',
      'id',
      'messageId',
      'pinnedByIdentityId',
    ];

    return (
      document.removed !== true &&
      document.scopeType === 'community_channel' &&
      typeof document.createdAt === 'number' &&
      stringFields.every((field) => typeof document[field] === 'string')
    );
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBCommunityChannelMessagePinDocument {
    if (!this.hasRequiredFields(document)) return false;
    const candidate = document as OrbitDBCommunityChannelMessagePinDocument;

    try {
      const communityId = new CommunityId(candidate.communityId);
      const channelId = new CommunityChannelId(candidate.channelId);
      const messageId = new CommunityChannelMessageId(candidate.messageId);
      this.toPin(candidate);

      return candidate.id === this.pinId(communityId, channelId, messageId);
    } catch {
      return false;
    }
  }

  private putIndexDocument(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    document: Record<string, unknown>,
  ): Promise<void> {
    const key = this.indexHeadKey(communityId, channelId);

    return this.pinIndex.putRecord(
      key,
      {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        id: key,
      },
      document,
      [],
      {
        recordFilter: (record) =>
          record.communityId === communityId.valueOf() &&
          record.channelId === channelId.valueOf(),
        replace: true,
      },
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

    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      await this.registry.putDocument('pins', document);
      await this.putIndexDocument(communityId, channelId, document);
    });
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

    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      await this.registry.putDocument('pins', document);
      await this.putIndexDocument(communityId, channelId, document);
    });
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CommunityChannelMessagePin[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
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
    });
  }
}
