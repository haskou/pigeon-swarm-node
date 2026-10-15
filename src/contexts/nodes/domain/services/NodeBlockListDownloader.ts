import { NodeBlockList } from '../NodeBlockList';
import { NodeBlockSourceOrigin } from '../value-objects/NodeBlockSourceOrigin';

/**
 * Downloads the list a source publishes. It does not judge the signer or the
 * version; that is the source's job. Throws `NodeBlockSourceFetchFailedError`.
 */
export default abstract class NodeBlockListDownloader {
  public abstract download(
    origin: NodeBlockSourceOrigin,
  ): Promise<NodeBlockList>;
}
