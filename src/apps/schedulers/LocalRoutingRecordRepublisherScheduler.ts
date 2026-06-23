import IpfsIdentityRouting from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRouting';
import IpfsKeychainRouting from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRouting';
import Kernel from '@app/Kernel';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class LocalRoutingRecordRepublisherScheduler extends Scheduler {
  constructor(
    private readonly identityRouting: IpfsIdentityRouting,
    private readonly keychainRouting: IpfsKeychainRouting,
  ) {
    super();
  }

  public async execute(): Promise<void> {
    const [identities, keychains] = await Promise.all([
      this.identityRouting.republish(),
      this.keychainRouting.republish(),
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
