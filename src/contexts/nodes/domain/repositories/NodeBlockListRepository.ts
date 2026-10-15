import { NodeBlockList } from '../NodeBlockList';
import { NodeBlocks } from '../NodeBlocks';

export default abstract class NodeBlockListRepository {
  public abstract findLocal(): Promise<NodeBlocks>;
  public abstract saveLocal(list: NodeBlockList): Promise<void>;
}
