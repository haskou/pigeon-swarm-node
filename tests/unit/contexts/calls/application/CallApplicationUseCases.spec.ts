import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallEnder from '@app/contexts/calls/application/end-call/CallEnder';
import { CallEndMessage } from '@app/contexts/calls/application/end-call/messages/CallEndMessage';
import ActiveCallsFinder from '@app/contexts/calls/application/find-active-calls/ActiveCallsFinder';
import { ActiveCallsFindMessage } from '@app/contexts/calls/application/find-active-calls/messages/ActiveCallsFindMessage';
import CallHistoryFinder from '@app/contexts/calls/application/find-call-history/CallHistoryFinder';
import { CallHistoryFindMessage } from '@app/contexts/calls/application/find-call-history/messages/CallHistoryFindMessage';
import CallFinder from '@app/contexts/calls/application/find-call/CallFinder';
import { CallFindMessage } from '@app/contexts/calls/application/find-call/messages/CallFindMessage';
import CallParticipantLeaseFinder from '@app/contexts/calls/application/find-participant-leases/CallParticipantLeaseFinder';
import { CallParticipantLeasesFindMessage } from '@app/contexts/calls/application/find-participant-leases/messages/CallParticipantLeasesFindMessage';
import CallJoiner from '@app/contexts/calls/application/join-call/CallJoiner';
import { CallJoinMessage } from '@app/contexts/calls/application/join-call/messages/CallJoinMessage';
import CallLeaver from '@app/contexts/calls/application/leave-call/CallLeaver';
import { CallLeaveMessage } from '@app/contexts/calls/application/leave-call/messages/CallLeaveMessage';
import CallParticipantLeaseReleaser from '@app/contexts/calls/application/release-participant-lease/CallParticipantLeaseReleaser';
import CallParticipantLeaseRenewer from '@app/contexts/calls/application/renew-participant-lease/CallParticipantLeaseRenewer';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { mock } from 'jest-mock-extended';

const callId = '550e8400-e29b-41d4-a716-446655440001';
const participantIdentityId =
  'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';

describe('Call application use cases', () => {
  const authorizer = mock<CallAccessAuthorizer>();
  beforeEach(() => { authorizer.canAccess.mockResolvedValue(true); });
  it('ActiveCallsFinder delegates the participant lookup', async () => {
    const repository = mock<CallRepository>();
    const calls = [mock<Call>()];

    repository.findActiveByParticipant.mockResolvedValue(calls);

    await expect(
      new ActiveCallsFinder(repository, authorizer).find(
        new ActiveCallsFindMessage(participantIdentityId),
      ),
    ).resolves.toEqual(calls);
  });

  it('CallHistoryFinder delegates the participant history lookup', async () => {
    const repository = mock<CallRepository>();
    const calls = [mock<Call>()];

    calls[0].getScope.mockReturnValue(CallScope.conversation(new ConversationId("conversation-1")));
    repository.findByParticipant.mockResolvedValue(calls);

    await expect(
      new CallHistoryFinder(repository, authorizer).find(
        new CallHistoryFindMessage(participantIdentityId),
      ),
    ).resolves.toEqual(calls);
  });

  it('CallFinder returns a call visible to the requester', async () => {
    const repository = mock<CallRepository>();
    const call = mock<Call>();

    repository.findById.mockResolvedValue(call);
    call.hasParticipant.mockReturnValue(true);

    await expect(
      new CallFinder(repository, authorizer).find(
        new CallFindMessage(callId, participantIdentityId),
      ),
    ).resolves.toBe(call);
  });

  it('CallFinder hides calls from non-participants', async () => {
    const repository = mock<CallRepository>();
    const call = mock<Call>();

    repository.findById.mockResolvedValue(call);
    call.hasParticipant.mockReturnValue(false);

    await expect(
      new CallFinder(repository, authorizer).find(
        new CallFindMessage(callId, participantIdentityId),
      ),
    ).rejects.toBeInstanceOf(CallNotFoundError);
  });

  it('rejects a historical participant after current scope access is revoked', async () => {
    const repository = mock<CallRepository>();
    const access = mock<CallAccessAuthorizer>();
    const call = mock<Call>();
    repository.findById.mockResolvedValue(call);
    repository.findActiveByParticipant.mockResolvedValue([call]);
    repository.findByParticipant.mockResolvedValue([call]);
    call.hasParticipant.mockReturnValue(true);
    access.assertAccess.mockRejectedValue(new CallNotFoundError());
    access.canAccess.mockResolvedValue(false);

    await expect(new CallFinder(repository, access).find(new CallFindMessage(callId, participantIdentityId))).rejects.toBeInstanceOf(CallNotFoundError);
    await expect(new ActiveCallsFinder(repository, access).find(new ActiveCallsFindMessage(participantIdentityId))).resolves.toEqual([]);
    await expect(new CallHistoryFinder(repository, access).find(new CallHistoryFindMessage(participantIdentityId))).resolves.toEqual([]);
    const events = mock<DomainEventPublisher>();
    const leases = mock<CallParticipantLeaseRenewer>();
    await expect(new CallJoiner(repository, events, leases, access).join(new CallJoinMessage(callId, participantIdentityId))).rejects.toBeInstanceOf(CallNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(leases.renew).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('CallParticipantLeaseFinder delegates all requested call ids', async () => {
    const repository = mock<CallParticipantLeaseRepository>();
    const leases = [mock<CallParticipantLease>()];

    repository.findByCallIds.mockResolvedValue(leases);

    await expect(
      new CallParticipantLeaseFinder(repository).find(
        new CallParticipantLeasesFindMessage([callId]),
      ),
    ).resolves.toBe(leases);
    expect(repository.findByCallIds).toHaveBeenCalledWith([
      expect.objectContaining({ isEqual: expect.any(Function) }),
    ]);
  });

  it('CallEnder persists the transition and publishes its events', async () => {
    const repository = mock<CallRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const call = mock<Call>();
    const events = [mock<DomainEvent>()];

    repository.findById.mockResolvedValue(call);
    call.pullDomainEvents.mockReturnValue(events);

    await expect(
      new CallEnder(repository, eventPublisher, authorizer).end(
        new CallEndMessage(callId, participantIdentityId),
      ),
    ).resolves.toBe(call);
    expect(call.end).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(call);
    expect(eventPublisher.publish).toHaveBeenCalledWith(events);
  });

  it('CallJoiner renews the lease and publishes aggregate events', async () => {
    const repository = mock<CallRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const call = mock<Call>();
    const lease = mock<CallParticipantLease>();

    repository.findById.mockResolvedValue(call);
    call.pullDomainEvents.mockReturnValue([]);
    lease.pullDomainEvents.mockReturnValue([]);
    leaseRenewer.renew.mockResolvedValue(lease);

    await expect(
      new CallJoiner(repository, eventPublisher, leaseRenewer, authorizer).join(
        new CallJoinMessage(callId, participantIdentityId),
      ),
    ).resolves.toBe(call);
    expect(call.join).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(call);
    expect(leaseRenewer.renew).toHaveBeenCalledWith(call, expect.any(Object));
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
  });

  it('CallLeaver releases every lease and publishes aggregate events', async () => {
    const repository = mock<CallRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const leaseReleaser = mock<CallParticipantLeaseReleaser>();
    const call = mock<Call>();
    const lease = mock<CallParticipantLease>();

    repository.findById.mockResolvedValue(call);
    call.pullDomainEvents.mockReturnValue([]);
    lease.pullDomainEvents.mockReturnValue([]);
    leaseReleaser.release.mockResolvedValue([lease]);
    call.getScope.mockReturnValue(
      CallScope.communityChannel(
        new CommunityId('community'),
        new CommunityChannelId('voice'),
      ),
    );

    await expect(
      new CallLeaver(
        repository,
        eventPublisher,
        leaseReleaser,
        authorizer,
        mock<ConversationRepository>(),
      ).leave(new CallLeaveMessage(callId, participantIdentityId)),
    ).resolves.toBe(call);
    expect(call.leave).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(call);
    expect(leaseReleaser.release).toHaveBeenCalledWith(call, expect.any(Object));
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
  });

  it.each([
    ['CallEnder', (repository: CallRepository) =>
      new CallEnder(repository, mock<DomainEventPublisher>(), authorizer).end(
        new CallEndMessage(callId, participantIdentityId),
      )],
    ['CallJoiner', (repository: CallRepository) =>
      new CallJoiner(
        repository,
        mock<DomainEventPublisher>(),
        mock<CallParticipantLeaseRenewer>(),
        authorizer,
      ).join(new CallJoinMessage(callId, participantIdentityId))],
    ['CallLeaver', (repository: CallRepository) =>
      new CallLeaver(
        repository,
        mock<DomainEventPublisher>(),
        mock<CallParticipantLeaseReleaser>(),
        authorizer,
        mock<ConversationRepository>(),
      ).leave(new CallLeaveMessage(callId, participantIdentityId))],
  ])('%s rejects a missing call', async (_name, run) => {
    const repository = mock<CallRepository>();

    repository.findById.mockResolvedValue(undefined);

    await expect(run(repository)).rejects.toBeInstanceOf(CallNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
