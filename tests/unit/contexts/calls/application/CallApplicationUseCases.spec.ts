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
  it('ActiveCallsFinder delegates the participant lookup', async () => {
    const repository = mock<CallRepository>();
    const calls = [mock<Call>()];

    repository.findActiveByParticipant.mockResolvedValue(calls);

    await expect(
      new ActiveCallsFinder(repository).find(
        new ActiveCallsFindMessage(participantIdentityId),
      ),
    ).resolves.toBe(calls);
  });

  it('CallHistoryFinder delegates the participant history lookup', async () => {
    const repository = mock<CallRepository>();
    const calls = [mock<Call>()];

    repository.findByParticipant.mockResolvedValue(calls);

    await expect(
      new CallHistoryFinder(repository).find(
        new CallHistoryFindMessage(participantIdentityId),
      ),
    ).resolves.toBe(calls);
  });

  it('CallFinder returns a call visible to the requester', async () => {
    const repository = mock<CallRepository>();
    const call = mock<Call>();

    repository.findById.mockResolvedValue(call);
    call.hasParticipant.mockReturnValue(true);

    await expect(
      new CallFinder(repository).find(
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
      new CallFinder(repository).find(
        new CallFindMessage(callId, participantIdentityId),
      ),
    ).rejects.toBeInstanceOf(CallNotFoundError);
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
      new CallEnder(repository, eventPublisher).end(
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
      new CallJoiner(repository, eventPublisher, leaseRenewer).join(
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

    await expect(
      new CallLeaver(repository, eventPublisher, leaseReleaser).leave(
        new CallLeaveMessage(callId, participantIdentityId),
      ),
    ).resolves.toBe(call);
    expect(call.leave).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(call);
    expect(leaseReleaser.release).toHaveBeenCalledWith(call, expect.any(Object));
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
  });

  it.each([
    ['CallEnder', (repository: CallRepository) =>
      new CallEnder(repository, mock<DomainEventPublisher>()).end(
        new CallEndMessage(callId, participantIdentityId),
      )],
    ['CallJoiner', (repository: CallRepository) =>
      new CallJoiner(
        repository,
        mock<DomainEventPublisher>(),
        mock<CallParticipantLeaseRenewer>(),
      ).join(new CallJoinMessage(callId, participantIdentityId))],
    ['CallLeaver', (repository: CallRepository) =>
      new CallLeaver(
        repository,
        mock<DomainEventPublisher>(),
        mock<CallParticipantLeaseReleaser>(),
      ).leave(new CallLeaveMessage(callId, participantIdentityId))],
  ])('%s rejects a missing call', async (_name, run) => {
    const repository = mock<CallRepository>();

    repository.findById.mockResolvedValue(undefined);

    await expect(run(repository)).rejects.toBeInstanceOf(CallNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
