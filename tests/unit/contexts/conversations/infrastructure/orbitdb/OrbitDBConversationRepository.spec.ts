import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { legacyGroupGenesis } from '../../../../../support/legacyGroupGenesis';
import { ConversationMother } from '../../../../mothers/ConversationMother';
import { operationProof } from '../../support/operationProof';

describe('OrbitDBConversationRepository', () => {
  const heads = new Map<string, Record<string, unknown>>();
  const operationDocuments: Record<string, unknown>[] = [];
  let operationsQuery: jest.Mock;
  let messagesPut: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBConversationRepository;
  let mother: ConversationMother;

  beforeEach(async () => {
    heads.clear();
    operationDocuments.splice(0);
    mother = await ConversationMother.create();
    operationsQuery = jest.fn(async (matcher) =>
      operationDocuments.filter(matcher),
    );
    messagesPut = jest.fn(async () => 'ok');
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    void registry.register(mother.networkId.valueOf(), {
      conversationOperations: {
        put: jest.fn(async (document) => {
          upsertDocument(operationDocuments, document);

          return 'ok';
        }),
        query: operationsQuery,
      },
      heads: {
        all: jest.fn(async () =>
          [...heads.entries()].map(([key, value]) => ({ key, value })),
        ),
        get: jest.fn(async (key) => ({
          key,
          value: heads.get(key as string),
        })),
        put: jest.fn(async (key, value) => {
          heads.set(key as string, value as Record<string, unknown>);

          return 'ok';
        }),
      },
      messages: {
        put: messagesPut,
        query: jest.fn(async (): Promise<unknown[]> => []),
      },
    } as never);
    repository = new OrbitDBConversationRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should read a conversation as the fold of its signed operations', async () => {
    const conversation = await seeded(mother.buildGroup());

    const found = await repository.requireMetadataById(conversation.getId());

    expect(found.toPrimitives()).toEqual(conversation.toPrimitives());
    expect(await repository.hasById(conversation.getId())).toBe(true);
  });

  it('should never write conversation messages to the replicated message store', async () => {
    await seeded(mother.buildGroup());

    expect(messagesPut).not.toHaveBeenCalled();
    expect(
      [...heads.keys()].filter(
        (key) => !key.startsWith('conversation-operation-index:'),
      ),
    ).toEqual([]);
  });

  it('should find participant conversations from heads after they are indexed', async () => {
    await seeded(mother.buildGroup());
    operationsQuery.mockClear();

    const participantConversations = await repository.findByParticipant(
      mother.author,
      10,
    );

    expect(participantConversations).toHaveLength(1);
    expect(operationsQuery).not.toHaveBeenCalled();
  });

  it('should find only the one-to-one conversations of a participant', async () => {
    const oneToOne = await seeded(mother.build());
    await seeded(mother.buildGroup());

    const found = await repository.findOneToOneByParticipant(mother.author, 10);

    expect(found.map((conversation) => conversation.getId())).toEqual([
      oneToOne.getId(),
    ]);
  });

  it('should neither find nor list a group conversation stored by an older node', async () => {
    const legacy = legacyGroupGenesis({
      creatorIdentityId: mother.author.valueOf(),
      networkId: mother.networkId.valueOf(),
      participantIds: [mother.author.valueOf(), mother.recipient.valueOf()],
    });

    await repository.saveOperation(
      { isGenesis: () => true, toPrimitives: () => legacy } as never,
      operationProof(legacy.id),
    );

    expect(
      await repository.hasById(new ConversationId(legacy.conversationId)),
    ).toBe(false);
    expect(await repository.findByParticipant(mother.author, 10)).toEqual([]);
  });

  /** Stores the signed creation of a conversation, the only thing that makes it exist. */
  async function seeded<T extends Conversation>(conversation: T): Promise<T> {
    const participantIds = conversation
      .getParticipantIds()
      .map((participantId) => participantId.valueOf());
    const genesis = ConversationOperation.create({
      action: ConversationOperationAction.CONVERSATION_CREATED,
      args: conversation.isGroup()
        ? {
            name: 'Mother group',
            nonce: 'conversation-mother',
            participantIds,
            type: 'group',
          }
        : { participantIds, type: 'one-to-one' },
      authorIdentityId: conversation.getCreatorId() as IdentityId,
      conversationId: conversation.getId(),
      createdAt: 1780000000000,
      networkId: conversation.getNetworkId(),
      parents: [],
    });

    await repository.saveOperation(genesis, operationProof(genesis.getId()));

    return conversation;
  }
});

function upsertDocument(
  documents: Record<string, unknown>[],
  document: Record<string, unknown>,
): void {
  const existingIndex = documents.findIndex(
    (candidate) => candidate.id === document.id,
  );

  if (existingIndex === -1) {
    documents.push(document);

    return;
  }

  documents[existingIndex] = document;
}
