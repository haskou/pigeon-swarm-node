import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallLeaver from '@app/contexts/calls/application/leave-call/CallLeaver';
import { CallLeaveMessage } from '@app/contexts/calls/application/leave-call/messages/CallLeaveMessage';
import CallParticipantLeaseReleaser from '@app/contexts/calls/application/release-participant-lease/CallParticipantLeaseReleaser';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallEndedEvent } from '@app/contexts/calls/domain/events/CallEndedEvent';
import { CallParticipantLeftEvent } from '@app/contexts/calls/domain/events/CallParticipantLeftEvent';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { GroupConversation } from '@app/contexts/conversations/domain/GroupConversation';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { GroupConversationName } from '@app/contexts/conversations/domain/value-objects/GroupConversationName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock } from 'jest-mock-extended';

describe('CallLeaver', () => {
  const creator = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const recipient = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

  it.each(['group', 'one-to-one'] as const)(
    'uses the actual %s conversation type for a two-participant departure',
    async (type) => {
      const conversation =
        type === 'group'
          ? GroupConversation.create(
              new GroupConversationName('Two-member group'),
              [creator, recipient],
              networkId,
            )
          : OneToOneConversation.create(creator, recipient, networkId);
      const call = Call.start(
        creator,
        networkId,
        CallScope.conversation(conversation.getId()),
        [recipient],
      );
      call.join(recipient);
      call.pullDomainEvents();
      const repository = mock<CallRepository>();
      const conversations = mock<ConversationRepository>();
      const publisher = mock<DomainEventPublisher>();
      const leases = mock<CallParticipantLeaseReleaser>();
      repository.findById.mockResolvedValue(call);
      conversations.findMetadataById.mockResolvedValue(conversation);
      leases.release.mockResolvedValue([]);
      const leaver = new CallLeaver(
        repository,
        publisher,
        leases,
        new CallAccessAuthorizer(conversations, mock<CommunityRepository>()),
        conversations,
      );

      const result = await leaver.leave(
        new CallLeaveMessage(call.getId().valueOf(), recipient.valueOf()),
      );

      expect(result.isActive()).toBe(type === 'group');
      expect(result.hasJoinedParticipant(recipient)).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(result);
      expect(publisher.publish).toHaveBeenCalledWith(
        type === 'group'
          ? [expect.any(CallParticipantLeftEvent)]
          : [expect.any(CallParticipantLeftEvent), expect.any(CallEndedEvent)],
      );
    },
  );
});
