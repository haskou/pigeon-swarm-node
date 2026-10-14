import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { IdentityPresenceNotFoundError } from '../../domain/errors/IdentityPresenceNotFoundError';
import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';

/**
 * Presence leases of identities connected to this node. They live only in
 * process memory and never leave the node.
 */
export default class InMemoryIdentityPresenceRepository extends IdentityPresenceRepository {
  private readonly presences = new Map<string, PrimitiveOf<IdentityPresence>>();

  private readByIdentityId(
    identityId: IdentityId,
  ): IdentityPresence | undefined {
    const primitives = this.presences.get(identityId.valueOf());

    return primitives ? IdentityPresence.fromPrimitives(primitives) : undefined;
  }

  public findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]> {
    return Promise.resolve(
      identityIds
        .map((identityId) => this.readByIdentityId(identityId))
        .filter(
          (presence): presence is IdentityPresence => presence !== undefined,
        ),
    );
  }

  public hasByIdentityId(identityId: IdentityId): Promise<boolean> {
    return Promise.resolve(this.presences.has(identityId.valueOf()));
  }

  public requireByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityPresence> {
    const presence = this.readByIdentityId(identityId);

    if (!presence) {
      return Promise.reject(new IdentityPresenceNotFoundError());
    }

    return Promise.resolve(presence);
  }

  public findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<IdentityPresence[]> {
    return Promise.resolve(
      [...this.presences.values()]
        .filter(
          (presence) =>
            (typeof presence.lastHeartbeatAt === 'number' &&
              presence.lastHeartbeatAt <= threshold.valueOf()) ||
            ['available', 'away'].includes(String(presence.status)),
        )
        .map((presence) => IdentityPresence.fromPrimitives(presence)),
    );
  }

  public save(presence: IdentityPresence): Promise<void> {
    this.presences.set(
      presence.getIdentityId().valueOf(),
      presence.toPrimitives(),
    );

    return Promise.resolve();
  }
}
