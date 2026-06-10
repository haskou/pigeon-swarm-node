import IpfsIdentityRepository from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRepository';
import IpfsKeychainRepository from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import Kernel from '@app/Kernel';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class LocalRoutingRecordRepublisherScheduler extends Scheduler {
  constructor(
    private readonly identityRepository: IpfsIdentityRepository,
    private readonly keychainRepository: IpfsKeychainRepository,
  ) {
    super();
  }

  public async execute(): Promise<void> {
    const [identities, keychains] = await Promise.all([
      this.identityRepository.republishLocalRoutingRecords(),
      this.keychainRepository.republishLocalRoutingRecords(),
    ]);

    Kernel.logger.info(
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
