import { MongoCallRepository } from '@app/contexts/calls/infrastructure/mongo/MongoCallRepository';
import { MissedCallPayload } from '@app/contexts/notifications/domain/MissedCallPayload';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { NotificationRepository } from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import OrbitDBNotificationRepository from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';
import { Timestamp } from '@haskou/value-objects';

const callRingingTimeoutMs = 60_000;
const callParticipantHeartbeatTimeoutMs = 5_000;

type CallTimeoutSchedulerDependencies = {
  callRepository?: Pick<
    MongoCallRepository,
    'findTimedOutJoinedCalls' | 'findTimedOutRingingCalls' | 'save'
  >;
  eventPublisher?: DomainEventPublisher;
  notificationRepository?: Pick<NotificationRepository, 'save'>;
};

export default class CallTimeoutScheduler extends Scheduler {
  private readonly eventPublisher: DomainEventPublisher;

  private readonly callRepository: Pick<
    MongoCallRepository,
    'findTimedOutJoinedCalls' | 'findTimedOutRingingCalls' | 'save'
  >;

  private readonly notificationRepository: Pick<NotificationRepository, 'save'>;

  constructor(dependencies: CallTimeoutSchedulerDependencies = {}) {
    super();

    const mongo =
      dependencies.callRepository && dependencies.notificationRepository
        ? undefined
        : this.get<MongoDB>(MongoDB);

    this.eventPublisher =
      dependencies.eventPublisher || this.get<MessageBus>(MessageBus);
    this.callRepository =
      dependencies.callRepository || new MongoCallRepository(mongo as MongoDB);
    this.notificationRepository =
      dependencies.notificationRepository ||
      new OrbitDBNotificationRepository();
  }

  private async markTimedOutJoinedParticipants(): Promise<void> {
    const threshold = new Timestamp(
      Date.now() - callParticipantHeartbeatTimeoutMs,
    );
    const calls = await this.callRepository.findTimedOutJoinedCalls(threshold);

    for (const call of calls) {
      const leftParticipants = call.markInactiveParticipants(threshold);

      if (leftParticipants.length === 0) {
        continue;
      }

      await this.callRepository.save(call);
      await this.eventPublisher.publish(call.pullDomainEvents());
    }
  }

  private async markTimedOutRingingParticipants(): Promise<void> {
    const threshold = new Timestamp(Date.now() - callRingingTimeoutMs);
    const calls = await this.callRepository.findTimedOutRingingCalls(threshold);

    for (const call of calls) {
      if (!call.shouldRecordMissedCall()) {
        continue;
      }

      const missedParticipants = call.markTimedOut(Timestamp.now());
      const primitives = call.toPrimitives();

      await this.callRepository.save(call);
      await this.eventPublisher.publish(call.pullDomainEvents());

      for (const participant of missedParticipants) {
        const notification = Notification.missedCall(
          MissedCallPayload.fromPrimitives({
            callerIdentityId: primitives.creatorIdentityId,
            callId: primitives.id,
            networkId: primitives.networkId,
            recipientIdentityId: participant.valueOf(),
          }),
        );

        await this.notificationRepository.save(notification);
        await this.eventPublisher.publish(notification.pullDomainEvents());
      }
    }
  }

  public async execute(): Promise<void> {
    await this.markTimedOutJoinedParticipants();
    await this.markTimedOutRingingParticipants();
  }

  public getCronExpression(): CronExpression {
    return {
      second: '*/5',
    };
  }

  public getProcessName(): string {
    return 'call-timeout';
  }
}
