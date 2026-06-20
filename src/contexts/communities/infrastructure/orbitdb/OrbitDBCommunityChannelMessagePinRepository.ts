import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessagePin } from '../../domain/CommunityChannelMessagePin';
import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
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

  private rawDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] | undefined {
    if (!record) {
      return undefined;
    }

    const pins = record.pins;

    if (!Array.isArray(pins)) {
      return [];
    }

    return pins.filter(
      (pin): pin is Record<string, unknown> =>
        typeof pin === 'object' && pin !== null && !Array.isArray(pin),
    );
  }

  private mergeDocuments(
    documents: Record<string, unknown>[],
    document: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const merged = new Map<string, Record<string, unknown>>();

    for (const current of documents) {
      if (typeof current.id === 'string') {
        merged.set(current.id, current);
      }
    }

    if (typeof document.id === 'string') {
      const current = merged.get(document.id);

      if (!current || this.freshness(current) <= this.freshness(document)) {
        merged.set(document.id, document);
      }
    }

    return [...merged.values()].filter((pin) => pin.removed !== true);
  }

  private async putIndex(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    documents: Record<string, unknown>[],
  ): Promise<void> {
    const key = this.indexHeadKey(communityId, channelId);
    const pins = documents.reduce(
      (merged, document) => this.mergeDocuments(merged, document),
      [] as Record<string, unknown>[],
    );

    await this.registry.putHead(key, {
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      id: key,
      pins: pins.map((pin) => ({ ...pin })),
      updatedAt: Date.now(),
    });
  }

  private async putIndexDocument(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    document: Record<string, unknown>,
  ): Promise<void> {
    await this.putIndex(communityId, channelId, [
      ...(this.rawDocumentsFromIndex(
        await this.registry.findHead(this.indexHeadKey(communityId, channelId)),
      ) || []),
      document,
    ]);
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
    await this.putIndexDocument(communityId, channelId, document);
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
    await this.putIndexDocument(communityId, channelId, document);
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CommunityChannelMessagePin[]> {
    const indexedDocuments = this.rawDocumentsFromIndex(
      await this.registry.findHead(this.indexHeadKey(communityId, channelId)),
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
