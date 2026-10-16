import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NodeBlockSource } from '../NodeBlockSource';
import NodeOwnerSettingsReset from './NodeOwnerSettingsReset';

/**
 * Adopted block sources; resetting their owner settings deletes every source
 * with its pending and approved entries.
 */
export default abstract class NodeBlockSourceRepository extends NodeOwnerSettingsReset {
  public abstract findAll(): Promise<NodeBlockSource[]>;
  /** Throws `NodeBlockSourceNotFoundError` when no source is pinned to `ownerIdentityId`. */
  public abstract find(ownerIdentityId: IdentityId): Promise<NodeBlockSource>;
  public abstract exists(ownerIdentityId: IdentityId): Promise<boolean>;
  public abstract save(source: NodeBlockSource): Promise<void>;
  public abstract delete(ownerIdentityId: IdentityId): Promise<void>;
}
