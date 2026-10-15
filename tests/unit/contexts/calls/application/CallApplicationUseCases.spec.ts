import { sampleMutation } from '../../../../support/signCall';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
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
import { CallParticipantNotFoundError } from '@app/contexts/calls/domain/errors/CallParticipantNotFoundError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { mock } from 'jest-mock-extended';

let mutation: Record<string, unknown>;
const callId = '550e8400-e29b-41d4-a716-446655440001';
const participantIdentityId =
  'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';

describe('Call application use cases', () => {
  beforeAll(async () => {
    mutation = await sampleMutation();
  });
  const authorizer = mock<CallAccessAuthorizer>();
  beforeEach(() => {
    authorizer.canAccess.mockResolvedValue(true);
  });
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

    calls[0].getScope.mockReturnValue(
      CallScope.conversation(new ConversationId('conversation-1')),
    );
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
    call.getScope.mockReturnValue(
      CallScope.conversation(new ConversationId('conversation')),
    );

    repository.requireById.mockResolvedValue(call);
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
    call.getScope.mockReturnValue(
      CallScope.conversation(new ConversationId('conversation')),
    );

    repository.requireById.mockResolvedValue(call);
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
    call.getScope.mockReturnValue(
      CallScope.conversation(new ConversationId('conversation')),
    );
    repository.requireById.mockResolvedValue(call);
    repository.findActiveByParticipant.mockResolvedValue([call]);
    repository.findByParticipant.mockResolvedValue([call]);
    call.hasParticipant.mockReturnValue(true);
    access.assertAccess.mockRejectedValue(new CallNotFoundError());
    access.canAccess.mockResolvedValue(false);

    await expect(
      new CallFinder(repository, access).find(
        new CallFindMessage(callId, participantIdentityId),
      ),
    ).rejects.toBeInstanceOf(CallNotFoundError);
    await expect(
      new ActiveCallsFinder(repository, access).find(
        new ActiveCallsFindMessage(participantIdentityId),
      ),
    ).resolves.toEqual([]);
    await expect(
      new CallHistoryFinder(repository, access).find(
        new CallHistoryFindMessage(participantIdentityId),
      ),
    ).resolves.toEqual([]);
    const events = mock<DomainEventPublisher>();
    const leases = mock<CallParticipantLeaseRenewer>();
    await expect(
      new CallJoiner(repository, events, leases, access).join(
        new CallJoinMessage(
          callId,
          participantIdentityId,
          mutation,
          1_770_000_000_000,
        ),
      ),
    ).rejects.toBeInstanceOf(CallNotFoundError);
    expect(repository.saveParticipant).not.toHaveBeenCalled();
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

  it('CallEnder persists the transition once accepted and publishes its events', async () => {
    const repository = mock<CallRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const call = mock<Call>();
    call.getScope.mockReturnValue(
      CallScope.conversation(new ConversationId('conversation')),
    );
    const events = [mock<DomainEvent>()];
    const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

    repository.requireById.mockResolvedValue(call);
    call.pullDomainEvents.mockReturnValue(events);

    await expect(
      new CallEnder(repository, eventPublisher, authorizer).end(
        new CallEndMessage(
          callId,
          participantIdentityId,
          mutation,
          1_770_000_000_000,
        ),
        onRecordAccepted,
      ),
    ).resolves.toBe(call);
    expect(call.end).toHaveBeenCalledTimes(1);
    expect(onRecordAccepted).toHaveBeenCalledTimes(1);
    expect(onRecordAccepted.mock.invocationCallOrder[0]).toBeLessThan(
      repository.saveEnd.mock.invocationCallOrder[0],
    );
    expect(repository.saveEnd).toHaveBeenCalledWith(call, expect.anything());
    expect(eventPublisher.publish).toHaveBeenCalledWith(events);
  });

  it.each([
    ['not ready while its record awaits admission', new Error('not ready')],
    ['as not found once its record is settled', undefined],
  ])(
    'CallEnder answers a participant the call does not show as joined %s',
    async (_case, notReady) => {
      const repository = mock<CallRepository>();
      const call = mock<Call>();
      const notFound = new CallParticipantNotFoundError();

      call.getId.mockReturnValue(mock());
      call.end.mockImplementation(() => {
        throw notFound;
      });
      repository.requireById.mockResolvedValue(call);
      if (notReady)
        repository.assertParticipantSettled.mockRejectedValue(notReady);
      else repository.assertParticipantSettled.mockResolvedValue();

      await expect(
        new CallEnder(repository, mock<DomainEventPublisher>(), authorizer).end(
          new CallEndMessage(
            callId,
            participantIdentityId,
            mutation,
            1_770_000_000_000,
          ),
        ),
      ).rejects.toBe(notReady ?? notFound);
      expect(repository.assertParticipantSettled).toHaveBeenCalledWith(
        call.getId(),
        new IdentityId(participantIdentityId),
      );
      expect(repository.saveEnd).not.toHaveBeenCalled();
    },
  );

  it('CallJoiner renews the lease once accepted and publishes aggregate events', async () => {
    const repository = mock<CallRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const call = mock<Call>();
    call.getScope.mockReturnValue(
      CallScope.conversation(new ConversationId('conversation')),
    );
    const lease = mock<CallParticipantLease>();
    const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

    repository.requireById.mockResolvedValue(call);
    call.pullDomainEvents.mockReturnValue([]);
    lease.pullDomainEvents.mockReturnValue([]);
    leaseRenewer.renew.mockResolvedValue(lease);

    await expect(
      new CallJoiner(repository, eventPublisher, leaseRenewer, authorizer).join(
        new CallJoinMessage(
          callId,
          participantIdentityId,
          mutation,
          1_770_000_000_000,
        ),
        onRecordAccepted,
      ),
    ).resolves.toBe(call);
    expect(call.join).toHaveBeenCalledTimes(1);
    expect(onRecordAccepted).toHaveBeenCalledTimes(1);
    expect(onRecordAccepted.mock.invocationCallOrder[0]).toBeLessThan(
      repository.saveParticipant.mock.invocationCallOrder[0],
    );
    expect(repository.saveParticipant).toHaveBeenCalledWith(
      call,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(leaseRenewer.renew).toHaveBeenCalledWith(call, expect.any(Object));
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
  });

  it('CallLeaver releases every lease once accepted and publishes aggregate events', async () => {
    const repository = mock<CallRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const leaseReleaser = mock<CallParticipantLeaseReleaser>();
    const call = mock<Call>();
    call.getScope.mockReturnValue(
      CallScope.conversation(new ConversationId('conversation')),
    );
    const lease = mock<CallParticipantLease>();
    const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

    repository.requireById.mockResolvedValue(call);
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
      ).leave(
        new CallLeaveMessage(
          callId,
          participantIdentityId,
          mutation,
          1_770_000_000_000,
        ),
        onRecordAccepted,
      ),
    ).resolves.toBe(call);
    expect(call.leave).toHaveBeenCalledTimes(1);
    expect(onRecordAccepted).toHaveBeenCalledTimes(1);
    expect(onRecordAccepted.mock.invocationCallOrder[0]).toBeLessThan(
      repository.saveParticipant.mock.invocationCallOrder[0],
    );
    expect(repository.saveParticipant).toHaveBeenCalledWith(
      call,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(leaseReleaser.release).toHaveBeenCalledWith(
      call,
      expect.any(Object),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
  });

  const recordUseCases: Array<
    [
      string,
      (
        repository: CallRepository,
        onRecordAccepted: () => Promise<void>,
      ) => Promise<Call>,
    ]
  > = [
    [
      'CallEnder',
      (repository, onRecordAccepted) =>
        new CallEnder(repository, mock<DomainEventPublisher>(), authorizer).end(
          new CallEndMessage(
            callId,
            participantIdentityId,
            mutation,
            1_770_000_000_000,
          ),
          onRecordAccepted,
        ),
    ],
    [
      'CallJoiner',
      (repository, onRecordAccepted) =>
        new CallJoiner(
          repository,
          mock<DomainEventPublisher>(),
          mock<CallParticipantLeaseRenewer>(),
          authorizer,
        ).join(
          new CallJoinMessage(
            callId,
            participantIdentityId,
            mutation,
            1_770_000_000_000,
          ),
          onRecordAccepted,
        ),
    ],
    [
      'CallLeaver',
      (repository, onRecordAccepted) =>
        new CallLeaver(
          repository,
          mock<DomainEventPublisher>(),
          mock<CallParticipantLeaseReleaser>(),
          authorizer,
        ).leave(
          new CallLeaveMessage(
            callId,
            participantIdentityId,
            mutation,
            1_770_000_000_000,
          ),
          onRecordAccepted,
        ),
    ],
  ];

  it.each(recordUseCases)(
    '%s rejects a missing call without accepting a record',
    async (_name, run) => {
      const repository = mock<CallRepository>();
      const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

      repository.requireById.mockRejectedValue(new CallNotFoundError());

      await expect(run(repository, onRecordAccepted)).rejects.toBeInstanceOf(
        CallNotFoundError,
      );
      expect(onRecordAccepted).not.toHaveBeenCalled();
      expect(repository.saveStart).not.toHaveBeenCalled();
      expect(repository.saveParticipant).not.toHaveBeenCalled();
      expect(repository.saveEnd).not.toHaveBeenCalled();
    },
  );

  it.each(recordUseCases)(
    '%s accepts no record while the node is not ready to answer',
    async (_name, run) => {
      const repository = mock<CallRepository>();
      const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

      repository.requireById.mockRejectedValue(
        new ReplicatedStateNotReadyError(),
      );

      await expect(run(repository, onRecordAccepted)).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
      expect(onRecordAccepted).not.toHaveBeenCalled();
    },
  );

  it.each(recordUseCases)(
    '%s stores nothing when the accepted record is refused',
    async (_name, run) => {
      const repository = mock<CallRepository>();
      const call = mock<Call>();
      const overBudget = new Error('over budget');

      call.getScope.mockReturnValue(
        CallScope.conversation(new ConversationId('conversation')),
      );
      repository.requireById.mockResolvedValue(call);

      await expect(
        run(repository, jest.fn().mockRejectedValue(overBudget)),
      ).rejects.toBe(overBudget);
      expect(repository.saveParticipant).not.toHaveBeenCalled();
      expect(repository.saveEnd).not.toHaveBeenCalled();
    },
  );
});
