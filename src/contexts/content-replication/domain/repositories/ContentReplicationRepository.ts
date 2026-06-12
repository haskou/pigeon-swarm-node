import { IPFSId } from '../../../shared/infrastructure/ipfs/helia/IPFSId';
import { ContentReplication } from '../ContentReplication';

export default abstract class ContentReplicationRepository {
  public abstract findAll(): Promise<ContentReplication[]>;
  public abstract findByCid(
    cid: IPFSId,
  ): Promise<ContentReplication | undefined>;

  public abstract save(content: ContentReplication): Promise<void>;
}
