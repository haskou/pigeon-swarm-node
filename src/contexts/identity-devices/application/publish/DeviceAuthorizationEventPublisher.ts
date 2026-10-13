import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';

import { DeviceAuthorization } from '../../domain/DeviceAuthorization';

export default class DeviceAuthorizationEventPublisher {
  public constructor(
    private readonly localPublisher: LocalDomainEventPublisher,
  ) {}

  public async publish(authorization: DeviceAuthorization): Promise<void> {
    const domainEvents = authorization.pullDomainEvents();

    if (domainEvents.length === 0) {
      return;
    }

    await this.localPublisher.publishLocally(domainEvents);
  }
}
