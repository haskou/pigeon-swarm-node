import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityChannelMessageDocument } from './documents/OrbitDBCommunityChannelMessageDocument';

export default class OrbitDBCommunityChannelMessageIndex {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
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
      typeof value.createdAt === 'number'
    );
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
    const documents = await this.registry.queryDocuments(
      'messages',
      (document) =>
        document.scopeType === 'community_channel' &&
        document.communityId === communityId.valueOf() &&
        document.channelId === channelId.valueOf(),
    );

    return documents.filter((document) => this.isDocument(document));
  }

  public async allByCommunity(
    communityId: CommunityId,
  ): Promise<OrbitDBCommunityChannelMessageDocument[]> {
    const documents = await this.registry.queryDocuments(
      'messages',
      (document) =>
        document.scopeType === 'community_channel' &&
        document.communityId === communityId.valueOf(),
    );

    return documents.filter((document) => this.isDocument(document));
  }
}
