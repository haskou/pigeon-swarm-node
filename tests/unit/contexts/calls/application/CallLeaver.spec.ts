import { sampleMutation } from '../../../../support/signCall';
import { callStartArgs } from '../../../../support/signCall';
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
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationType } from '@app/contexts/conversations/domain/value-objects/ConversationType';
import { GroupConversationName } from '@app/contexts/conversations/domain/value-objects/GroupConversationName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock } from 'jest-mock-extended';

describe('CallLeaver', () => {
  let mutation: Record<string, unknown>;
  beforeAll(async () => {
    mutation = await sampleMutation();
  });
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
      const participants = [creator, recipient];
      const conversation =
        type === 'group'
          ? new GroupConversation(
              ConversationId.deriveGroup(
                networkId.valueOf(),
                creator.valueOf(),
                'nonce',
              ),
              networkId,
              new GroupConversationName('Two-member group'),
              participants,
              [],
              creator,
            )
          : new OneToOneConversation(
              ConversationId.deterministic(creator, recipient, networkId),
              networkId,
              ConversationType.ONE_TO_ONE,
              participants,
              undefined,
              [],
              creator,
            );
      const call = Call.start(
        creator,
        networkId,
        CallScope.conversation(conversation.getId()),
        [recipient],
        ...callStartArgs(),
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
      );

      const result = await leaver.leave(
        new CallLeaveMessage(
          call.getId().valueOf(),
          recipient.valueOf(),
          mutation,
          1_770_000_000_001,
        ),
      );

      expect(result.isActive()).toBe(false);
      expect(result.hasJoinedParticipant(recipient)).toBe(false);
      expect(repository.saveParticipant).toHaveBeenCalledWith(
        result,
        recipient,
        expect.anything(),
      );
      expect(publisher.publish).toHaveBeenCalledWith([
        expect.any(CallParticipantLeftEvent),
        expect.any(CallEndedEvent),
      ]);
    },
  );
});
