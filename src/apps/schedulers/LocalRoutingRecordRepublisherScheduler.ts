import IpfsIdentityRouting from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRouting';
import IpfsKeychainRouting from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRouting';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Kernel from '@haskou/ddd-kernel';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';

export default class LocalRoutingRecordRepublisherScheduler extends Scheduler {
  constructor(
    private readonly identityRouting: IpfsIdentityRouting,
    private readonly keychainRouting: IpfsKeychainRouting,
  ) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    const identities = await this.identityRouting.republish();
    const keychains = await this.keychainRouting.republish();

    Kernel.logger.debug?.(
      `Republished local routing records: identities=${identities}, keychains=${keychains}, messages=0`,
    );
  }

  public getCronExpression(): CronExpression {
    return {
      minute: 30,
      second: 30,
    };
  }

  public getProcessName(): string {
    return 'local-routing-record-republisher';
  }
}
