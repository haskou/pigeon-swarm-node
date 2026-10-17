import { NodeBlockList } from '../NodeBlockList';
import { NodeBlocks } from '../NodeBlocks';
import NodeOwnerSettingsReset from './NodeOwnerSettingsReset';

/** The node's own block list; resetting its owner settings deletes it. */
export default abstract class NodeBlockListRepository extends NodeOwnerSettingsReset {
  public abstract findLocal(): Promise<NodeBlocks>;
  public abstract saveLocal(list: NodeBlockList): Promise<void>;

  /**
   * Deletes the stored list when its owner or a blocked identity is not a
   * canonical id, and reports whether it did. The owner signed the list, so
   * no entry can be cut from it without breaking its signature.
   */
  public abstract purgeNonCanonical(): Promise<boolean>;
}
