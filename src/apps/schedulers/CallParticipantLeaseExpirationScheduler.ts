import CallParticipantLeaseExpirationRegistrar from '@app/contexts/calls/application/expire-participant-leases/CallParticipantLeaseExpirationRegistrar';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler, { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class CallParticipantLeaseExpirationScheduler extends Scheduler {
  constructor(
    private readonly expirationRegistrar: CallParticipantLeaseExpirationRegistrar,
  ) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    await this.expirationRegistrar.expire();
  }

  public getCronExpression(): CronExpression {
    return { second: '*/5' };
  }

  public getProcessName(): string {
    return 'call-participant-lease-expiration';
  }
}
