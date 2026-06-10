import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { IdentitySyncAvailableEvent } from '../../domain/events/IdentitySyncAvailableEvent';
import IdentityRepository from '../../domain/repositories/IdentityRepository';
import { IdentitySyncResponseMessage } from './messages/IdentitySyncResponseMessage';

export default class IdentitySyncResponder {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker: SyncResponseSuppressionTracker,
  ) {}

  public async respond(message: IdentitySyncResponseMessage): Promise<void> {
    const shouldRespond = await this.tracker.shouldRespond(
      'identity',
      message.identityId.valueOf(),
      message.requestId,
    );

    if (!shouldRespond) {
      return;
    }

    const candidates = await this.repository.findCandidateReferencesById(
      message.identityId,
    );

    if (candidates.length === 0) {
      return;
    }

    const candidate = candidates.sort(
      (left, right) =>
        right.identity.toPrimitives().version -
        left.identity.toPrimitives().version,
    )[0];

    await this.eventPublisher.publish([
      new IdentitySyncAvailableEvent(message.identityId.valueOf(), {
        externalIdentifier: candidate.externalIdentifier.valueOf(),
        identityId: message.identityId.valueOf(),
        requestId: message.requestId,
        version: candidate.identity.toPrimitives().version,
      }),
    ]);
  }
}
