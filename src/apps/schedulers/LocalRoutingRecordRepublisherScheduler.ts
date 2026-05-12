import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import IpfsIdentityRepository from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRepository';
import IpfsKeychainRepository from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import Kernel from '@app/Kernel';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class LocalRoutingRecordRepublisherScheduler extends Scheduler {
  private readonly conversationRepository: MongoConversationRepository =
    this.get<MongoConversationRepository>(MongoConversationRepository);

  private readonly identityRepository: IpfsIdentityRepository =
    this.get<IpfsIdentityRepository>(IpfsIdentityRepository);

  private readonly keychainRepository: IpfsKeychainRepository =
    this.get<IpfsKeychainRepository>(IpfsKeychainRepository);

  public async execute(): Promise<void> {
    const [identities, keychains, messages] = await Promise.all([
      this.identityRepository.republishLocalRoutingRecords(),
      this.keychainRepository.republishLocalRoutingRecords(),
      this.conversationRepository.republishLocalRoutingRecords(),
    ]);

    Kernel.logger.info(
      `Republished local routing records: identities=${identities}, keychains=${keychains}, messages=${messages}`,
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
