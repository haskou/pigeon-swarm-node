import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { IdentityPresenceNotFoundError } from '../../domain/errors/IdentityPresenceNotFoundError';
import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import { PresenceStatus } from '../../domain/value-objects/PresenceStatus';

export default class InMemoryIdentityPresenceRepository extends IdentityPresenceRepository {
  private readonly presences = new Map<
    string,
    Map<string, PrimitiveOf<IdentityPresence>>
  >();

  private clone(presence: IdentityPresence): IdentityPresence {
    return IdentityPresence.fromPrimitives(presence.toPrimitives());
  }

  private presenceFrom(
    primitives: PrimitiveOf<IdentityPresence> | undefined,
  ): IdentityPresence | undefined {
    return primitives ? IdentityPresence.fromPrimitives(primitives) : undefined;
  }

  private isOlderThanCurrent(
    snapshot: PrimitiveOf<IdentityPresence>,
    current: PrimitiveOf<IdentityPresence> | undefined,
  ): boolean {
    return current !== undefined && snapshot.updatedAt < current.updatedAt;
  }

  private readByIdentityId(
    identityId: IdentityId,
  ): IdentityPresence | undefined {
    const leases = [
      ...(this.presences.get(identityId.valueOf())?.values() ?? []),
    ];
    const connected = leases.filter(
      (lease) =>
        PresenceStatus.fromPrimitives(lease.status).isDisconnected() === false,
    );
    const candidates = connected.length > 0 ? connected : leases;
    const latest = candidates.sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )[0];
    const latestPreference = leases.sort(
      (left, right) => right.preferenceUpdatedAt - left.preferenceUpdatedAt,
    )[0];
    const effectivePresence = this.presenceFrom(latest);

    if (effectivePresence && latestPreference) {
      effectivePresence.mergePreferenceFrom(
        IdentityPresence.fromPrimitives(latestPreference),
      );
    }

    return effectivePresence;
  }

  private readByIdentityIdAndNodeId(
    identityId: IdentityId,
    nodeId: NodeId,
  ): IdentityPresence | undefined {
    return this.presenceFrom(
      this.presences.get(identityId.valueOf())?.get(nodeId.valueOf()),
    );
  }

  public findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]> {
    const presences = identityIds
      .map((identityId) => this.readByIdentityId(identityId))
      .filter(
        (presence): presence is IdentityPresence => presence !== undefined,
      );

    return Promise.resolve(presences);
  }

  public hasByIdentityId(identityId: IdentityId): Promise<boolean> {
    return Promise.resolve(this.readByIdentityId(identityId) !== undefined);
  }

  public hasByIdentityIdAndNodeId(
    identityId: IdentityId,
    nodeId: NodeId,
  ): Promise<boolean> {
    return Promise.resolve(
      this.readByIdentityIdAndNodeId(identityId, nodeId) !== undefined,
    );
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

  public requireByIdentityIdAndNodeId(
    identityId: IdentityId,
    nodeId: NodeId,
  ): Promise<IdentityPresence> {
    const presence = this.readByIdentityIdAndNodeId(identityId, nodeId);

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
        .flatMap((leases) => [...leases.values()])
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
    const primitives = snapshot.toPrimitives();
    const identityId = snapshot.getIdentityId().valueOf();
    const ownerNodeId = primitives.ownerNodeId;

    if (!ownerNodeId) {
      return Promise.reject(new Error('Presence lease requires an owner node'));
    }

    const leases =
      this.presences.get(identityId) ??
      new Map<string, PrimitiveOf<IdentityPresence>>();

    if (this.isOlderThanCurrent(primitives, leases.get(ownerNodeId))) {
      return Promise.resolve();
    }

    leases.set(ownerNodeId, primitives);
    this.presences.set(identityId, leases);

    return Promise.resolve();
  }
}
