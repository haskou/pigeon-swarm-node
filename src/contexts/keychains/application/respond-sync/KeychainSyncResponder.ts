import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { KeychainSyncAvailableEvent } from '../../domain/events/KeychainSyncAvailableEvent';
import CurrentKeychainFinder from '../find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '../find-current/messages/CurrentKeychainFindMessage';
import { KeychainSyncResponseMessage } from './messages/KeychainSyncResponseMessage';

export default class KeychainSyncResponder {
  constructor(
    private readonly finder: CurrentKeychainFinder,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker: SyncResponseSuppressionTracker,
  ) {}

  public async respond(message: KeychainSyncResponseMessage): Promise<void> {
    const shouldRespond = await this.tracker.shouldRespond(
      'keychain',
      message.ownerIdentityId.valueOf(),
      message.requestId,
    );

    if (!shouldRespond) {
      return;
    }

    const candidate = await this.finder.find(
      new CurrentKeychainFindMessage(message.ownerIdentityId.valueOf()),
    );

    await this.eventPublisher.publish([
      new KeychainSyncAvailableEvent(message.ownerIdentityId.valueOf(), {
        externalIdentifier: candidate.externalIdentifier.valueOf(),
        ownerIdentityId: message.ownerIdentityId.valueOf(),
        requestId: message.requestId,
        version: candidate.keychain.toPrimitives().version,
      }),
    ]);
  }
}
