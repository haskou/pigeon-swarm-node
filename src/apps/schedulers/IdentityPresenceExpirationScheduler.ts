import IdentityPresenceExpirationRegistrar from '@app/contexts/presence/application/expire/IdentityPresenceExpirationRegistrar';
import ObservedScheduler from '@app/shared/infrastructure/scheduler/ObservedScheduler';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class IdentityPresenceExpirationScheduler extends ObservedScheduler {
  constructor(
    private readonly expirationRegistrar: IdentityPresenceExpirationRegistrar,
  ) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  protected async executeObserved(): Promise<void> {
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
