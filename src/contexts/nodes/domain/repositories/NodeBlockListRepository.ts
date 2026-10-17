import { NodeBlockList } from '../NodeBlockList';
import { NodeBlocks } from '../NodeBlocks';
import NodeOwnerSettingsReset from './NodeOwnerSettingsReset';

/** The node's own block list; resetting its owner settings deletes it. */
export default abstract class NodeBlockListRepository extends NodeOwnerSettingsReset {
  public abstract findLocal(): Promise<NodeBlocks>;
  public abstract saveLocal(list: NodeBlockList): Promise<void>;
}
