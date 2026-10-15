import { ClearedNodeOwnerSetting } from '../value-objects/ClearedNodeOwnerSetting';

/**
 * A local store of settings that belong to the node owner. The owner reset
 * clears every one of them; a new owner-settings store implements this and is
 * added to `NodeOwnerSettingsResetter`.
 */
export default abstract class NodeOwnerSettingsReset {
  /** Clears this store's owner settings and names what it removed. */
  public abstract resetOwnerSettings(): Promise<ClearedNodeOwnerSetting[]>;
}
