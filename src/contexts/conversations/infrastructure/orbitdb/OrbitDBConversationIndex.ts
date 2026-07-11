import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBConversationDocument } from './documents/OrbitDBConversationDocument';

export default class OrbitDBConversationIndex {
  private readonly index: OrbitDBHeadIndex<OrbitDBConversationDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    this.index = new OrbitDBHeadIndex<OrbitDBConversationDocument>(
      this.registry,
      {
        collectionName: 'conversations',
        documentFromRecord: (record) => this.documentFromRecord(record),
        recordId: (record) =>
          typeof record.id === 'string' ? record.id : undefined,
        shouldReplace: (current, candidate) =>
          this.freshness(current) <= this.freshness(candidate),
      },
    );
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] | undefined {
    const value = document[attribute];

    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.every((item) => typeof item === 'string') ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private isCompleteDocument(
    document: Partial<OrbitDBConversationDocument>,
  ): document is OrbitDBConversationDocument {
    return [
      document.createdAt,
      document.id,
      document.networkId,
      document.participantIds,
      document.type,
    ].every((value) => value !== undefined);
  }

  private documentFromRecord(
    record: Record<string, unknown>,
  ): OrbitDBConversationDocument | undefined {
    const document: Partial<OrbitDBConversationDocument> = {
      createdAt: this.numberValue(record, 'createdAt') ?? 0,
      id: this.stringValue(record, 'id'),
      lastEventId: this.stringValue(record, 'lastEventId'),
      lastEventType: this.stringValue(record, 'lastEventType'),
      name: this.stringValue(record, 'name'),
      networkId: this.stringValue(record, 'networkId'),
      participantIds: this.stringArrayValue(record, 'participantIds'),
      receivedAt: this.numberValue(record, 'receivedAt'),
      type: this.stringValue(record, 'type') as
        OrbitDBConversationDocument['type'] | undefined,
      updatedAt: this.numberValue(record, 'updatedAt'),
    };

    return this.isCompleteDocument(document) ? document : undefined;
  }

  private freshness(document: OrbitDBConversationDocument): number {
    return Math.max(
      document.updatedAt ?? 0,
      document.receivedAt ?? 0,
      document.createdAt,
    );
  }

  private conversationHeadKey(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  private participantIndexHeadKey(participantId: string): string {
    return `conversation-participant-index:${participantId}`;
  }

  private async findParticipantIndexDocuments(
    participantId: string,
  ): Promise<OrbitDBConversationDocument[]> {
    return (
      (await this.index.find(this.participantIndexHeadKey(participantId))) ?? []
    );
  }

  private cachedParticipantIndexDocuments(
    participantId: string,
  ): OrbitDBConversationDocument[] {
    return (
      this.index.documentsFromHead(
        this.registry.findCachedHead(
          this.participantIndexHeadKey(participantId),
        ),
      ) ?? []
    );
  }

  private async putParticipantIndex(
    participantId: string,
    documents: OrbitDBConversationDocument[],
  ): Promise<void> {
    const conversations = this.index.deduplicate(documents);
    const networkIds = [
      ...new Set(conversations.map((conversation) => conversation.networkId)),
    ];

    await this.index.putDocuments(
      this.participantIndexHeadKey(participantId),
      {
        id: this.participantIndexHeadKey(participantId),
        participantId,
      },
      conversations,
      { networkIds },
    );
  }

  private replicateParticipantIndexInBackground(
    participantId: string,
    documents: OrbitDBConversationDocument[],
  ): void {
    const conversations = this.index.deduplicate(documents);
    const networkIds = [
      ...new Set(conversations.map((conversation) => conversation.networkId)),
    ];

    this.index.replicateDocumentsInBackground(
      this.participantIndexHeadKey(participantId),
      {
        id: this.participantIndexHeadKey(participantId),
        participantId,
      },
      conversations,
      { networkIds },
    );
  }

  public async findById(
    conversationId: ConversationId,
  ): Promise<OrbitDBConversationDocument | undefined> {
    const head = await this.registry.findHead(
      this.conversationHeadKey(conversationId.valueOf()),
    );

    return head ? this.documentFromRecord(head) : undefined;
  }

  public async findByParticipant(
    participantId: IdentityId,
  ): Promise<OrbitDBConversationDocument[]> {
    const indexedDocuments = await this.findParticipantIndexDocuments(
      participantId.valueOf(),
    );

    if (indexedDocuments.length > 0) {
      return indexedDocuments;
    }

    return this.index.deduplicate(
      this.registry
        .findCachedHeadsByPrefix('conversation:')
        .map((candidate) => this.documentFromRecord(candidate))
        .filter(
          (document): document is OrbitDBConversationDocument =>
            document !== undefined &&
            document.participantIds.includes(participantId.valueOf()),
        ),
    );
  }

  public deduplicate(
    documents: OrbitDBConversationDocument[],
  ): OrbitDBConversationDocument[] {
    return this.index.deduplicate(documents);
  }

  public async put(document: OrbitDBConversationDocument): Promise<void> {
    await this.registry.putHead(this.conversationHeadKey(document.id), {
      ...document,
    });
    await Promise.all(
      document.participantIds.map(async (participantId) =>
        this.putParticipantIndex(participantId, [
          ...(await this.findParticipantIndexDocuments(participantId)),
          document,
        ]),
      ),
    );
  }

  public replicateInBackground(document: OrbitDBConversationDocument): void {
    this.registry.replicateHeadInBackground(
      this.conversationHeadKey(document.id),
      {
        ...document,
      },
      [document.networkId],
    );

    document.participantIds.forEach((participantId) =>
      this.replicateParticipantIndexInBackground(participantId, [
        ...this.cachedParticipantIndexDocuments(participantId),
        document,
      ]),
    );
  }
}
