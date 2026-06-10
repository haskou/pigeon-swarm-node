import PushSubscriptionRepository from '../../domain/repositories/PushSubscriptionRepository';
import { PushSubscriptionRemoveMessage } from './messages/PushSubscriptionRemoveMessage';

export class PushSubscriptionRemover {
  constructor(private readonly repository: PushSubscriptionRepository) {}

  public async remove(message: PushSubscriptionRemoveMessage): Promise<void> {
    await this.repository.delete(message.identityId, message.endpoint);
  }
}
