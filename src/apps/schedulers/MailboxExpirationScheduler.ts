import MailboxExpirer from '@app/contexts/mailboxes/application/expire/MailboxExpirer';
import ReplicatedStateSchedulerErrorPolicy from '@app/shared/infrastructure/scheduler/ReplicatedStateSchedulerErrorPolicy';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import { CronExpression } from '@haskou/ddd-kernel/scheduler';
import { Timestamp } from '@haskou/value-objects';

export default class MailboxExpirationScheduler extends Scheduler {
  constructor(private readonly expirer: MailboxExpirer) {
    super(new ReplicatedStateSchedulerErrorPolicy());
  }

  public async execute(): Promise<void> {
    await this.expirer.expire(Timestamp.now());
  }

  public getCronExpression(): CronExpression {
    return { minute: '*/5', second: 40 };
  }

  public getProcessName(): string {
    return 'mailbox-expiration';
  }
}
