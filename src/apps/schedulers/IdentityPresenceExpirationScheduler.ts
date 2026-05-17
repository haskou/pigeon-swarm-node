import { MongoIdentityMetadataRepository } from '@app/contexts/identities/infrastructure/mongo';
import { IdentityPresenceServicesFactory } from '@app/contexts/presence/application/IdentityPresenceServicesFactory';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';
import { CronExpression } from '@app/shared/infrastructure/scheduler/SchedulerCronExpression';

export default class IdentityPresenceExpirationScheduler extends Scheduler {
  private presenceServices(): IdentityPresenceServicesFactory {
    return new IdentityPresenceServicesFactory(
      this.get<MongoDB>(MongoDB),
      this.get<MongoIdentityMetadataRepository>(
        MongoIdentityMetadataRepository,
      ),
      this.get<MessageBus>(MessageBus),
    );
  }

  public async execute(): Promise<void> {
    await this.presenceServices().expirationRegistrar().expire();
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
