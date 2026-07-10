import CallSignalDeliveryExpirationRegistrar from '@app/contexts/calls/application/expire-signal-deliveries/CallSignalDeliveryExpirationRegistrar';
import CallSignalDeliveryRetrier from '@app/contexts/calls/application/retry-signal-deliveries/CallSignalDeliveryRetrier';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler, { CronExpression } from '@haskou/ddd-kernel/scheduler';
import { Timestamp } from '@haskou/value-objects';

export default class CallSignalDeliveryMaintenanceScheduler extends Scheduler {
  constructor(
    private readonly retrier: CallSignalDeliveryRetrier,
    private readonly expirationRegistrar: CallSignalDeliveryExpirationRegistrar,
  ) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    const now = Timestamp.now();

    await this.retrier.retry(now);
    await this.expirationRegistrar.expire(now);
  }

  public getCronExpression(): CronExpression {
    return {
      second: '*',
    };
  }

  public getProcessName(): string {
    return 'call-signal-delivery-maintenance';
  }
}
