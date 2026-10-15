import { NodeBlockEntries } from '../NodeBlockEntries';

/** The owner's local exceptions: entries adopted lists never block. */
export default abstract class NodeBlockExceptionsRepository {
  public abstract find(): Promise<NodeBlockEntries>;
  public abstract save(exceptions: NodeBlockEntries): Promise<void>;
}
