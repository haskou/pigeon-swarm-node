import { CallScopeResolver } from '@app/contexts/calls/application/start-call/CallScopeResolver';
import { CallStarter } from '@app/contexts/calls/application/start-call/CallStarter';
import { CallStartMessage } from '@app/contexts/calls/application/start-call/messages/CallStartMessage';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallRepository } from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityRepository } from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { Community } from '@app/contexts/communities/domain/Community';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import {
  ConversationMessageCandidate,
  ConversationMessagesAround,
  ConversationRepository,
  ConversationSyncScope,
} from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationType } from '@app/contexts/conversations/domain/value-objects/ConversationType';
import { Message } from '@app/contexts/conversations/domain/Message';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

class InMemoryCallRepository implements CallRepository {
  public readonly savedCalls: Call[] = [];

  public async findActiveByCommunity(): Promise<Call[]> {
    return [];
  }

  public async findActiveByCommunityChannel(): Promise<Call | undefined> {
    return undefined;
  }

  public async findActiveByParticipant(participantId: IdentityId): Promise<Call[]> {
    return this.savedCalls.filter((call) => call.hasParticipant(participantId));
  }

  public async findByCommunityChannel(): Promise<Call[]> {
    return [];
  }

  public async findByConversationId(): Promise<Call[]> {
    return [];
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    return this.savedCalls.find((call) => call.getId().isEqual(id));
  }

  public async findByParticipant(participantId: IdentityId): Promise<Call[]> {
    return this.findActiveByParticipant(participantId);
  }

  public async findTimedOutJoinedCalls(): Promise<Call[]> {
    return [];
  }

  public async findTimedOutRingingCalls(): Promise<Call[]> {
    return [];
  }

  public async save(call: Call): Promise<void> {
    this.savedCalls.push(call);
  }
}

class SingleConversationRepository implements ConversationRepository {
  constructor(private readonly conversation: Conversation) {}

  public async countUnreadByRecipient(): Promise<Map<string, number>> {
    return new Map();
  }

  public async findById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    if (this.conversation.getId().isNotEqual(conversationId)) {
      return undefined;
    }

    return this.conversation;
  }

  public async findByParticipant(): Promise<Conversation[]> {
    return [];
  }

  public async findCandidateMessageById(): Promise<Message | undefined> {
    return undefined;
  }

  public async findConversationSyncScopes(): Promise<ConversationSyncScope[]> {
    return [];
  }

  public async findLatestMessages(): Promise<Message[]> {
    return [];
  }

  public async findMessageById(): Promise<Message | undefined> {
    return undefined;
  }

  public async findMessageCandidates(): Promise<ConversationMessageCandidate[]> {
    return [];
  }

  public async findMessagesAround(): Promise<ConversationMessagesAround> {
    return { messages: [] };
  }

  public async findOneToOne(): Promise<undefined> {
    return undefined;
  }

  public async markReadUntil(): Promise<void> {}

  public async registerUnreadForMessage(): Promise<void> {}

  public async save(): Promise<void> {}
}

class EmptyCommunityRepository implements CommunityRepository {
  public async delete(): Promise<void> {}

  public async findById(): Promise<Community | undefined> {
    return undefined;
  }

  public async findByMember(): Promise<Community[]> {
    return [];
  }

  public async findDiscoverable(): Promise<Community[]> {
    return [];
  }

  public async save(): Promise<void> {}
}

class RecordingEventPublisher implements DomainEventPublisher {
  public readonly publishedEvents: DomainEvent[] = [];

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    this.publishedEvents.push(...domainEvents);
  }
}

describe('CallStarter', () => {
  const caller = new IdentityId(
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
  );
  const recipient = new IdentityId(
    'MCowBQYDK2VwAyEARcVr0970Zu0KPAIPEEvpy9RjsnM05VnDmccfWloMx8k=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

  it('starts a conversation call using participants from the conversation aggregate', async () => {
    const conversationId = ConversationId.deterministic(
      caller,
      recipient,
      networkId,
    );
    const conversation = new Conversation(
      conversationId,
      networkId,
      ConversationType.ONE_TO_ONE,
      [caller, recipient],
    );
    const repository = new InMemoryCallRepository();
    const eventPublisher = new RecordingEventPublisher();
    const starter = new CallStarter(
      repository,
      new CallScopeResolver(
        new SingleConversationRepository(conversation),
        new EmptyCommunityRepository(),
      ),
      eventPublisher,
    );

    const call = await starter.start(
      new CallStartMessage(
        caller.valueOf(),
        'conversation',
        conversationId.valueOf(),
      ),
    );

    expect(repository.savedCalls).toEqual([call]);
    expect(call.hasParticipant(caller)).toBe(true);
    expect(call.hasParticipant(recipient)).toBe(true);
    expect(eventPublisher.publishedEvents).toHaveLength(1);
  });
});
