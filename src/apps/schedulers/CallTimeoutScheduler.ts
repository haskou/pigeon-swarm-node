import { MongoCallRepository } from '@app/contexts/calls/infrastructure/mongo/MongoCallRepository';
import { MissedCallPayload } from '@app/contexts/notifications/domain/MissedCallPayload';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import MongoNotificationMapper from '@app/contexts/notifications/infrastructure/mongo/mappers/MongoNotificationMapper';
import MongoNotificationRepository from '@app/contexts/notifications/infrastructure/mongo/MongoNotificationRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';
import { Timestamp } from '@haskou/value-objects';

const callRingingTimeoutMs = 60_000;

type CallTimeoutSchedulerDependencies = {
  callRepository?: Pick<
    MongoCallRepository,
    'findTimedOutRingingCalls' | 'save'
  >;
  eventPublisher?: DomainEventPublisher;
  notificationRepository?: Pick<MongoNotificationRepository, 'save'>;
};

export default class CallTimeoutScheduler extends Scheduler {
  private readonly eventPublisher: DomainEventPublisher;

  private readonly callRepository: Pick<
    MongoCallRepository,
    'findTimedOutRingingCalls' | 'save'
  >;

  private readonly notificationRepository: Pick<
    MongoNotificationRepository,
    'save'
  >;

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
      new MongoNotificationRepository(
        mongo as MongoDB,
        new MongoNotificationMapper(),
      );
  }

  public async execute(): Promise<void> {
    const timeoutThreshold = new Timestamp(Date.now() - callRingingTimeoutMs);
    const calls =
      await this.callRepository.findTimedOutRingingCalls(timeoutThreshold);

    for (const call of calls) {
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

  public getCronExpression(): CronExpression {
    return {
      minute: '*',
      second: 0,
    };
  }

  public getProcessName(): string {
    return 'call-timeout';
  }
}
