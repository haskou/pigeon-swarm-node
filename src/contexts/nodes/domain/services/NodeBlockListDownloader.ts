import { SignedNodeBlockList } from '../SignedNodeBlockList';
import { NodeBlockSourceOrigin } from '../value-objects/NodeBlockSourceOrigin';

/**
 * Downloads the bytes a source publishes and their signature, unparsed. It
 * judges neither the signature, the document, the signer nor the version;
 * that is the source's job, in that order. Throws
 * `NodeBlockSourceFetchFailedError`.
 */
export default abstract class NodeBlockListDownloader {
  public abstract download(
    origin: NodeBlockSourceOrigin,
  ): Promise<SignedNodeBlockList>;
}
