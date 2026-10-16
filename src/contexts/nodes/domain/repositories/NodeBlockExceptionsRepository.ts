import { NodeBlockEntries } from '../NodeBlockEntries';
import NodeOwnerSettingsReset from './NodeOwnerSettingsReset';

/**
 * The owner's local exceptions: entries adopted lists never block. Resetting
 * its owner settings deletes them.
 */
export default abstract class NodeBlockExceptionsRepository extends NodeOwnerSettingsReset {
  public abstract find(): Promise<NodeBlockEntries>;
  public abstract save(exceptions: NodeBlockEntries): Promise<void>;
}
