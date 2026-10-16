import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NodeBlockSource } from '../NodeBlockSource';
import { NodeBlockSourceVersionFloor } from '../value-objects/NodeBlockSourceVersionFloor';
import NodeOwnerSettingsReset from './NodeOwnerSettingsReset';

/**
 * Adopted block sources; resetting their owner settings deletes every source
 * with its pending and approved entries. The highest version accepted from
 * each publisher survives both deletion and the reset, so no older signed list
 * is accepted again.
 */
export default abstract class NodeBlockSourceRepository extends NodeOwnerSettingsReset {
  public abstract findAll(): Promise<NodeBlockSource[]>;
  /** Throws `NodeBlockSourceNotFoundError` when no source is pinned to `ownerIdentityId`. */
  public abstract find(ownerIdentityId: IdentityId): Promise<NodeBlockSource>;
  public abstract exists(ownerIdentityId: IdentityId): Promise<boolean>;
  public abstract save(source: NodeBlockSource): Promise<void>;
  public abstract delete(ownerIdentityId: IdentityId): Promise<void>;
  /** Floor 0 for a publisher no list was ever accepted from. */
  public abstract versionFloor(
    ownerIdentityId: IdentityId,
  ): Promise<NodeBlockSourceVersionFloor>;
}
