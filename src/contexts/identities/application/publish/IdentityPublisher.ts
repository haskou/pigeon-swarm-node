import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { InvalidIdentityCandidateError } from '../../domain/errors/InvalidIdentityCandidateError';
import { Identity } from '../../domain/Identity';
import IdentityRepository from '../../domain/repositories/IdentityRepository';
import IdentityCandidateValidationDomainService from '../../domain/services/IdentityCandidateValidationDomainService';
import IdentitySaverService from '../../domain/services/IdentitySaverService';
import { IdentityPublishMessage } from './messages/IdentityPublishMessage';

export default class IdentityPublisher {
  constructor(
    private readonly saver: IdentitySaverService,
    private readonly repository: IdentityRepository,
    private readonly validator: IdentityCandidateValidationDomainService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async publish(message: IdentityPublishMessage): Promise<Identity> {
    const identity = message.identity;
    const primitives = identity.toPrimitives();
    const isValid = await this.validator.isValidChainFor(
      new IdentityId(primitives.id),
      identity,
      (externalIdentifier) =>
        this.repository.findByExternalIdentifier(externalIdentifier),
    );

    if (!isValid) {
      throw new InvalidIdentityCandidateError();
    }

    const externalIdentifier = await this.saver.save(identity);
    const events = identity.pullDomainEvents();

    for (const event of events) {
      event.attributes.externalIdentifier = externalIdentifier.valueOf();
      event.attributes.handle = primitives.profile.handle;
      event.attributes.networkIds = primitives.networks;
      event.attributes.previousExternalIdentifier =
        primitives.previousIdentityExternalIdentifier;
      event.attributes.version = primitives.version;
    }

    await this.eventPublisher.publish(events);

    return identity;
  }
}
