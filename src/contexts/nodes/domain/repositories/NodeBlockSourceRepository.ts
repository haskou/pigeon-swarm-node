import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NodeBlockSource } from '../NodeBlockSource';

export default abstract class NodeBlockSourceRepository {
  public abstract findAll(): Promise<NodeBlockSource[]>;
  /** Throws `NodeBlockSourceNotFoundError` when no source is pinned to `ownerIdentityId`. */
  public abstract find(ownerIdentityId: IdentityId): Promise<NodeBlockSource>;
  public abstract exists(ownerIdentityId: IdentityId): Promise<boolean>;
  public abstract save(source: NodeBlockSource): Promise<void>;
  public abstract delete(ownerIdentityId: IdentityId): Promise<void>;
}
