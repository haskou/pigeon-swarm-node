import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import { IdentityPresenceFindMessage } from './messages/IdentityPresenceFindMessage';

export default class IdentityPresenceFinder {
  constructor(private readonly repository: IdentityPresenceRepository) {}

  public async find(
    message: IdentityPresenceFindMessage,
  ): Promise<IdentityPresence[]> {
    const identityIds = message.getIdentityIds();
    const existing = await this.repository.findByIdentityIds(identityIds);
    const existingIdentityIds = existing.map((presence) =>
      presence.getIdentityId(),
    );
    const missing = identityIds
      .filter((identityId) =>
        existingIdentityIds.every((existingIdentityId) =>
          existingIdentityId.isNotEqual(identityId),
        ),
      )
      .map((identityId) => IdentityPresence.disconnected(identityId));

    return [...existing, ...missing];
  }
}
