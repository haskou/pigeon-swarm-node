import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import OrbitDBConversationMessageMapper from '@app/contexts/conversations/infrastructure/orbitdb/mappers/OrbitDBConversationMessageMapper';
import OrbitDBConversationMapper from '@app/contexts/conversations/infrastructure/orbitdb/mappers/OrbitDBConversationMapper';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Signature, Timestamp } from '@haskou/value-objects';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('OrbitDBConversationRepository', () => {
  const heads = new Map<string, Record<string, unknown>>();
  const conversationDocuments: Record<string, unknown>[] = [];
  const messageDocuments: Record<string, unknown>[] = [];
  let conversationsQuery: jest.Mock;
  let messagesQuery: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBConversationRepository;
  let mother: ConversationMother;

  beforeEach(async () => {
    heads.clear();
    conversationDocuments.splice(0);
    messageDocuments.splice(0);
    mother = await ConversationMother.create();
    conversationsQuery = jest.fn(async (matcher) =>
      conversationDocuments.filter(matcher),
    );
    messagesQuery = jest.fn(async (matcher) =>
      messageDocuments.filter(matcher),
    );
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register(mother.networkId.valueOf(), {
      conversations: {
        put: jest.fn(async (document) => {
          upsertDocument(conversationDocuments, document);

          return 'ok';
        }),
        query: conversationsQuery,
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
        put: jest.fn(async (document) => {
          upsertDocument(messageDocuments, document);

          return 'ok';
        }),
        query: messagesQuery,
      },
    } as never);
    repository = new OrbitDBConversationRepository(
      registry,
      new OrbitDBConversationMapper(),
      new OrbitDBConversationMessageMapper(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save and read conversations with messages from OrbitDB', async () => {
    const conversation = mother.build();
    const firstMessage = conversation.sendMessage(
      mother.author,
      new EncryptedMessagePayload('first'),
      signature(),
      { createdAt: new Timestamp(1780000000000) },
    );
    conversation.sendMessage(
      mother.recipient,
      new EncryptedMessagePayload('second'),
      signature(),
      { createdAt: new Timestamp(1780000000001) },
    );

    await repository.save(conversation);

    const found = await repository.findById(conversation.getId());
    const latestMessages = await repository.findLatestMessages(
      conversation.getId(),
      10,
    );
    const participantConversations = await repository.findByParticipant(
      mother.author,
      10,
    );

    expect(found?.toPrimitives().messages).toHaveLength(2);
    expect(latestMessages.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({
        encryptedPayload: 'first',
        id: firstMessage.getId().valueOf(),
        type: MessageType.SENT.valueOf(),
      }),
      expect.objectContaining({
        encryptedPayload: 'second',
        type: MessageType.SENT.valueOf(),
      }),
    ]);
    expect(participantConversations).toHaveLength(1);
    const summary = heads.get(
      `conversation-message-summary:${conversation.getId().valueOf()}`,
    );

    expect(summary?.messages).toHaveLength(2);
    expect(summary?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstMessage.getId().valueOf() }),
      ]),
    );
    expect(
      (summary?.messages as Record<string, unknown>[]).every(
        (message) => message.encryptedPayload === undefined,
      ),
    ).toBe(true);
  });

  it('should compute unread counts from OrbitDB read markers', async () => {
    const conversation = mother.build();
    const firstMessage = conversation.sendMessage(
      mother.author,
      new EncryptedMessagePayload('first'),
      signature(),
      { createdAt: new Timestamp(1780000000000) },
    );
    conversation.sendMessage(
      mother.author,
      new EncryptedMessagePayload('second'),
      signature(),
      { createdAt: new Timestamp(1780000000001) },
    );
    await repository.save(conversation);

    const beforeRead = await repository.countUnreadByRecipient(
      mother.recipient,
      [conversation.getId()],
    );
    await repository.markReadUntil(
      conversation.getId(),
      mother.recipient,
      firstMessage.getId(),
    );
    const afterRead = await repository.countUnreadByRecipient(
      mother.recipient,
      [conversation.getId()],
    );

    expect(beforeRead.get(conversation.getId().valueOf())).toBe(2);
    expect(afterRead.get(conversation.getId().valueOf())).toBe(1);
  });

  it('should mark an external timestamped message id as read without querying messages', async () => {
    const conversation = mother.build();

    await repository.save(conversation);
    messagesQuery.mockClear();

    await repository.markReadUntil(
      conversation.getId(),
      mother.recipient,
      new MessageId(`${conversation.getId().valueOf()}:1781121453305:client`),
    );

    const marker = heads.get(
      `read-marker:${conversation.getId().valueOf()}:${mother.recipient.valueOf()}`,
    );

    expect(messagesQuery).not.toHaveBeenCalled();
    expect(marker).toEqual(
      expect.objectContaining({
        conversationId: conversation.getId().valueOf(),
        messageCreatedAt: 1781121453305,
        messageId: `${conversation.getId().valueOf()}:1781121453305:client`,
        networkId: mother.networkId.valueOf(),
        recipientIdentityId: mother.recipient.valueOf(),
      }),
    );
  });

  it('should count unread messages for several conversations from message indexes', async () => {
    const secondAuthor = await ConversationMother.generateIdentityId();
    const firstConversation = mother.build();
    const secondConversation = new ConversationMother(
      secondAuthor,
      mother.recipient,
      mother.networkId,
    ).build();

    firstConversation.sendMessage(
      mother.author,
      new EncryptedMessagePayload('first'),
      signature(),
      { createdAt: new Timestamp(1780000000000) },
    );
    secondConversation.sendMessage(
      secondAuthor,
      new EncryptedMessagePayload('second'),
      signature(),
      { createdAt: new Timestamp(1780000000001) },
    );
    await repository.save(firstConversation);
    await repository.save(secondConversation);
    messagesQuery.mockClear();

    const unreadCounts = await repository.countUnreadByRecipient(
      mother.recipient,
      [firstConversation.getId(), secondConversation.getId()],
    );

    expect(messagesQuery).not.toHaveBeenCalled();
    expect(unreadCounts.get(firstConversation.getId().valueOf())).toBe(1);
    expect(unreadCounts.get(secondConversation.getId().valueOf())).toBe(1);
  });

  it('should find participant conversations from heads after they are indexed', async () => {
    const conversation = mother.build();

    await repository.save(conversation);
    conversationsQuery.mockClear();

    const participantConversations = await repository.findByParticipant(
      mother.author,
      10,
    );

    expect(participantConversations).toHaveLength(1);
    expect(conversationsQuery).not.toHaveBeenCalled();
  });

  it('should hide target messages after saving a deletion', async () => {
    const conversation = mother.build();
    const target = conversation.sendMessage(
      mother.author,
      new EncryptedMessagePayload('target'),
      signature(),
      { createdAt: new Timestamp(1780000000000) },
    );
    await repository.save(conversation);

    conversation.deleteMessage(
      mother.author,
      target.getId(),
      signature(),
      new Timestamp(1780000000001),
    );
    await repository.save(conversation);

    const messages = await repository.findLatestMessages(
      conversation.getId(),
      10,
    );

    expect(messages.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({
        targetMessageId: target.getId().valueOf(),
        type: MessageType.DELETED.valueOf(),
      }),
    ]);
  });
});

function signature(): Signature {
  return new Signature(
    'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
  );
}

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
