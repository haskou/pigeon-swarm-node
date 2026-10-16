import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallLeaver from '@app/contexts/calls/application/leave-call/CallLeaver';
import { CallLeaveMessage } from '@app/contexts/calls/application/leave-call/messages/CallLeaveMessage';
import CallParticipantLeaseReleaser from '@app/contexts/calls/application/release-participant-lease/CallParticipantLeaseReleaser';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import { CallEndedEvent } from '@app/contexts/calls/domain/events/CallEndedEvent';
import { CallParticipantLeftEvent } from '@app/contexts/calls/domain/events/CallParticipantLeftEvent';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallCapabilityHash } from '@app/contexts/calls/domain/value-objects/CallCapabilityHash';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

import { sampleMutation } from '../../../../support/signCall';
import { callStartArgs } from '../../../../support/signCall';

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
  const capability = 'Zm9yLXRoZS1ncm91cC1jYWxsLW9ubHktMzItYnl0ZXM';

  const leaverFor = (
    call: Call,
    conversations = mock<ConversationRepository>(),
  ) => {
    const repository = mock<CallRepository>();
    const publisher = mock<DomainEventPublisher>();
    const leases = mock<CallParticipantLeaseReleaser>();
    repository.requireById.mockResolvedValue(call);
    leases.release.mockResolvedValue([]);

    return {
      leaver: new CallLeaver(
        repository,
        publisher,
        leases,
        new CallAccessAuthorizer(conversations, mock<CommunityRepository>()),
      ),
      publisher,
      repository,
    };
  };

  it('ends a one-to-one call when one of its two participants departs', async () => {
    const conversation = new OneToOneConversation(
      ConversationId.deterministic(creator, recipient, networkId),
      networkId,
      [creator, recipient],
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
    const conversations = mock<ConversationRepository>();
    conversations.hasById.mockResolvedValue(true);
    conversations.requireMetadataById.mockResolvedValue(conversation);
    const { leaver, publisher, repository } = leaverFor(call, conversations);

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
      expect.anything(),
    );
    expect(publisher.publish).toHaveBeenCalledWith([
      expect.any(CallParticipantLeftEvent),
      expect.any(CallEndedEvent),
    ]);
  });

  describe('a group-capability call', () => {
    const groupCall = () => {
      const call = Call.start(
        creator,
        networkId,
        CallScope.groupCapability(
          new CallCapabilityHash(BearerCapability.hash(capability)),
        ),
        [],
        ...callStartArgs(),
      );
      call.joinOrAdd(recipient);
      call.pullDomainEvents();

      return call;
    };

    it('stays active when a capability holder leaves', async () => {
      const { leaver, publisher } = leaverFor(groupCall());

      const result = await leaver.leave(
        new CallLeaveMessage(
          groupCall().getId().valueOf(),
          recipient.valueOf(),
          mutation,
          1_770_000_000_001,
          capability,
        ),
      );

      expect(result.isActive()).toBe(true);
      expect(result.hasJoinedParticipant(recipient)).toBe(false);
      expect(publisher.publish).toHaveBeenCalledWith([
        expect.any(CallParticipantLeftEvent),
      ]);
    });

    it('refuses a leave carrying a wrong capability', async () => {
      const { leaver, repository } = leaverFor(groupCall());

      await expect(
        leaver.leave(
          new CallLeaveMessage(
            groupCall().getId().valueOf(),
            recipient.valueOf(),
            mutation,
            1_770_000_000_001,
            'd3JvbmctY2FwYWJpbGl0eS10b2tlbi1mb3ItY2FsbA',
          ),
        ),
      ).rejects.toBeInstanceOf(CallNotFoundError);
      expect(repository.saveParticipant).not.toHaveBeenCalled();
    });
  });
});
