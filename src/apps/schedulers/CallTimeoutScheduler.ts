import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { MissedCallPayload } from '@app/contexts/notifications/domain/MissedCallPayload';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';
import { Timestamp } from '@haskou/value-objects';

const callRingingTimeoutMs = 60_000;
const callParticipantHeartbeatTimeoutMs = 5_000;

export default class CallTimeoutScheduler extends Scheduler {
  constructor(
    private readonly callRepository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly notificationRepository: NotificationRepository,
  ) {
    super();
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
