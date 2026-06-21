import IdentityRoutingRepublisher from '@app/contexts/identities/application/routing/IdentityRoutingRepublisher';
import KeychainRoutingRepublisher from '@app/contexts/keychains/application/routing/KeychainRoutingRepublisher';
import Kernel from '@app/Kernel';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class LocalRoutingRecordRepublisherScheduler extends Scheduler {
  constructor(
    private readonly identityRepublisher: IdentityRoutingRepublisher,
    private readonly keychainRepublisher: KeychainRoutingRepublisher,
  ) {
    super();
  }

  public async execute(): Promise<void> {
    const [identities, keychains] = await Promise.all([
      this.identityRepublisher.republish(),
      this.keychainRepublisher.republish(),
    ]);

    Kernel.logger.debug?.(
      `Republished local routing records: identities=${identities}, keychains=${keychains}, messages=0`,
    );
  }

  public getCronExpression(): CronExpression {
    return {
      minute: '*/5',
      second: 30,
    };
  }

  public getProcessName(): string {
    return 'local-routing-record-republisher';
  }
}
