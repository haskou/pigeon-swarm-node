import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

import { IdentityPresence } from '../IdentityPresence';

export default abstract class IdentityPresenceRepository {
  public abstract hasByIdentityId(identityId: IdentityId): Promise<boolean>;

  public abstract findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]>;

  public abstract hasByIdentityIdAndNodeId(
    identityId: IdentityId,
    nodeId: NodeId,
  ): Promise<boolean>;

  public abstract findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<IdentityPresence[]>;

  public abstract requireByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityPresence>;

  public abstract requireByIdentityIdAndNodeId(
    identityId: IdentityId,
    nodeId: NodeId,
  ): Promise<IdentityPresence>;

  public abstract save(
    presence: IdentityPresence,
    networkIds?: string[],
  ): Promise<void>;
}
