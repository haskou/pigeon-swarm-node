import CallScopeResolver from '@app/contexts/calls/application/start-call/CallScopeResolver';
import CallStarter from '@app/contexts/calls/application/start-call/CallStarter';
import { CallStartMessage } from '@app/contexts/calls/application/start-call/messages/CallStartMessage';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationType } from '@app/contexts/conversations/domain/value-objects/ConversationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

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
    const repository: MockProxy<CallRepository> = mock<CallRepository>();
    const conversationRepository: MockProxy<ConversationRepository> =
      mock<ConversationRepository>();
    const communityRepository: MockProxy<CommunityRepository> =
      mock<CommunityRepository>();
    const eventPublisher: MockProxy<DomainEventPublisher> =
      mock<DomainEventPublisher>();
    let savedCall: Awaited<Parameters<CallRepository['save']>[0]> | undefined;

    repository.findActiveByCommunityChannel.mockResolvedValue(undefined);
    repository.save.mockImplementation((call) => {
      savedCall = call;

      return Promise.resolve();
    });
    conversationRepository.findMetadataById.mockResolvedValue(conversation);

    const starter = new CallStarter(
      repository,
      new CallScopeResolver(conversationRepository, communityRepository),
      eventPublisher,
    );

    const call = await starter.start(
      new CallStartMessage(
        caller.valueOf(),
        'conversation',
        conversationId.valueOf(),
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(call);
    expect(savedCall).toBe(call);
    expect(call.hasParticipant(caller)).toBe(true);
    expect(call.hasParticipant(recipient)).toBe(true);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
  });

  it('starts a community channel call with only the requester joined initially', async () => {
    const repository: MockProxy<CallRepository> = mock<CallRepository>();
    const conversationRepository: MockProxy<ConversationRepository> =
      mock<ConversationRepository>();
    const communityRepository: MockProxy<CommunityRepository> =
      mock<CommunityRepository>();
    const eventPublisher: MockProxy<DomainEventPublisher> =
      mock<DomainEventPublisher>();
    const authorizeVoiceChannelCall = jest.fn();
    let savedCall: Awaited<Parameters<CallRepository['save']>[0]> | undefined;

    repository.findActiveByCommunityChannel.mockResolvedValue(undefined);
    repository.save.mockImplementation((call) => {
      savedCall = call;

      return Promise.resolve();
    });
    communityRepository.findById.mockResolvedValue({
      authorizeVoiceChannelCall,
      toPrimitives: () => ({
        networkId: networkId.valueOf(),
      }),
    } as never);

    const starter = new CallStarter(
      repository,
      new CallScopeResolver(conversationRepository, communityRepository),
      eventPublisher,
    );

    const call = await starter.start(
      new CallStartMessage(
        caller.valueOf(),
        'community_channel',
        undefined,
        'community-1',
        'voice-1',
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(call);
    expect(savedCall).toBe(call);
    expect(authorizeVoiceChannelCall).toHaveBeenCalledTimes(1);
    expect(call.hasParticipant(caller)).toBe(true);
    expect(call.hasParticipant(recipient)).toBe(false);
    expect(call.toPrimitives().participantIds).toEqual([caller.valueOf()]);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
  });
});
