import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';

export default class InMemoryIdentityPresenceRepository extends IdentityPresenceRepository {
  private readonly presences = new Map<string, PrimitiveOf<IdentityPresence>>();

  private clone(presence: IdentityPresence): IdentityPresence {
    return IdentityPresence.fromPrimitives(presence.toPrimitives());
  }

  private presenceFrom(
    primitives: PrimitiveOf<IdentityPresence> | undefined,
  ): IdentityPresence | undefined {
    return primitives ? IdentityPresence.fromPrimitives(primitives) : undefined;
  }

  public findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityPresence | undefined> {
    return Promise.resolve(
      this.presenceFrom(this.presences.get(identityId.valueOf())),
    );
  }

  public async findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]> {
    const presences = await Promise.all(
      identityIds.map((identityId) => this.findByIdentityId(identityId)),
    );

    return presences.filter(
      (presence): presence is IdentityPresence => presence !== undefined,
    );
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
    const snapshot = this.clone(presence);

    this.presences.set(
      snapshot.getIdentityId().valueOf(),
      snapshot.toPrimitives(),
    );

    return Promise.resolve();
  }
}
