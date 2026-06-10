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
    const identity = await Identity.create(
      message.name,
      message.password,
      message.networks,
      message.handle,
    );
    const externalIdentifier = await this.saver.save(identity);
    const primitives = identity.toPrimitives();
    const events = identity.pullDomainEvents();

    for (const event of events) {
      event.attributes.externalIdentifier = externalIdentifier.valueOf();
      event.attributes.handle = primitives.profile.handle;
      event.attributes.networkIds = primitives.networks;
      event.attributes.version = primitives.version;
    }

    await this.eventPublisher.publish(events);

    return identity;
  }
}
