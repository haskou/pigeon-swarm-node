import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityChannelMessageDocument } from './documents/OrbitDBCommunityChannelMessageDocument';

export default class OrbitDBCommunityChannelMessageIndex {
  private readonly index: OrbitDBHeadIndex<OrbitDBCommunityChannelMessageDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    this.index = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'messages',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) => this.recordId(record),
      shouldReplace: (current, candidate) =>
        (current.receivedAt ?? 0) <= (candidate.receivedAt ?? 0),
    });
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityChannelMessageDocument {
    return (
      value.deleted !== true &&
      value.scopeType === 'community_channel' &&
      this.hasStringFields(value, [
        'authorIdentityId',
        'channelId',
        'communityId',
        'id',
        'type',
      ]) &&
      typeof value.createdAt === 'number' &&
      this.isStringArray(value.attachmentExternalIdentifiers)
    );
  }

  private messageIndexHeadKey(communityId: string, channelId: string): string {
    return `community-channel-message-index:${communityId}:${channelId}`;
  }

  private recordId(record: Record<string, unknown>): string | undefined {
    return typeof record.id === 'string'
      ? record.id
      : typeof record.messageId === 'string'
        ? record.messageId
        : undefined;
  }

  private stringValue(
    record: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = record[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private networkIdsFrom(records: Record<string, unknown>[]): string[] {
    return [
      ...new Set(
        records
          .map((message) => this.stringValue(message, 'networkId'))
          .filter((networkId): networkId is string => networkId !== undefined),
      ),
    ];
  }

  public getMessageId(
    document: OrbitDBCommunityChannelMessageDocument,
  ): string {
    return document.messageId || document.id;
  }

  public async findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<OrbitDBCommunityChannelMessageDocument[]> {
    return (
      (await this.index.find(
        this.messageIndexHeadKey(communityId.valueOf(), channelId.valueOf()),
      )) ?? []
    );
  }

  public allByCommunity(
    communityId: CommunityId,
  ): OrbitDBCommunityChannelMessageDocument[] {
    const prefix = `community-channel-message-index:${communityId.valueOf()}:`;

    return this.registry
      .findCachedHeadsByPrefix(prefix)
      .flatMap((head) => this.index.documentsFromHead(head) || []);
  }

  public async putDocuments(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    documents: OrbitDBCommunityChannelMessageDocument[],
  ): Promise<void> {
    const key = this.messageIndexHeadKey(
      communityId.valueOf(),
      channelId.valueOf(),
    );

    await this.index.putDocuments(
      key,
      {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        id: key,
      },
      documents,
    );
  }

  public async putRecord(record: Record<string, unknown>): Promise<void> {
    const communityId =
      typeof record.communityId === 'string' ? record.communityId : undefined;
    const channelId =
      typeof record.channelId === 'string' ? record.channelId : undefined;

    if (!communityId || !channelId) {
      return;
    }

    const key = this.messageIndexHeadKey(communityId, channelId);

    await this.index.putRecord(
      key,
      {
        channelId,
        communityId,
        id: key,
      },
      record,
    );
  }

  public replicateRecordInBackground(
    record: Record<string, unknown>,
  ): Promise<void> {
    const communityId = this.stringValue(record, 'communityId');
    const channelId = this.stringValue(record, 'channelId');

    if (!communityId || !channelId) {
      return Promise.resolve();
    }

    const key = this.messageIndexHeadKey(communityId, channelId);
    const records = this.index.mergeRecords(
      this.index.recordsFromHead(this.registry.findCachedHead(key)),
      record,
    );

    return this.index.replicateRecordInBackground(
      key,
      {
        channelId,
        communityId,
        id: key,
      },
      record,
      this.networkIdsFrom(records),
    );
  }
}
