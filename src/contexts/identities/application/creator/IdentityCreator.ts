import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Identity } from '../../domain/Identity';
import IdentitySaverService from '../../domain/services/IdentitySaverService';
import { IdentityCreateMessage } from './messages/IdentityCreateMessage';

export default class IdentityCreator {
  constructor(
    private readonly saver: IdentitySaverService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async create(message: IdentityCreateMessage): Promise<Identity> {
    const identity = await Identity.create(message.name, message.password);

    await this.saver.save(identity);
    await this.eventPublisher.publish(identity.pullDomainEvents());

    return identity;
  }
}
