import { NodeBlockListPrimitives } from '../NodeBlockListPrimitives';
import { NodeBlockSourceOrigin } from '../value-objects/NodeBlockSourceOrigin';

/**
 * Downloads the document a source publishes. It judges neither the signer,
 * the version, the signature nor the entries; that is the source's job, in
 * that order. Throws `NodeBlockSourceFetchFailedError`.
 */
export default abstract class NodeBlockListDownloader {
  public abstract download(
    origin: NodeBlockSourceOrigin,
  ): Promise<NodeBlockListPrimitives>;
}
