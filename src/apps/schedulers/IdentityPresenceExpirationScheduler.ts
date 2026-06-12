import IdentityPresenceExpirationRegistrar from '@app/contexts/presence/application/expire/IdentityPresenceExpirationRegistrar';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class IdentityPresenceExpirationScheduler extends Scheduler {
  constructor(
    private readonly expirationRegistrar: IdentityPresenceExpirationRegistrar,
  ) {
    super();
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
