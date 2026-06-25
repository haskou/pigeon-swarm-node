import IdentityPresenceExpirationRegistrar from '@app/contexts/presence/application/expire/IdentityPresenceExpirationRegistrar';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class IdentityPresenceExpirationScheduler extends Scheduler {
  constructor(
    private readonly expirationRegistrar: IdentityPresenceExpirationRegistrar,
  ) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    await this.expirationRegistrar.expire();
  }

  public getProcessName(): string {
    return 'identity-presence-expiration';
  }

  public getCronExpression(): CronExpression {
    return {
      second: '*/10',
    };
  }
}
