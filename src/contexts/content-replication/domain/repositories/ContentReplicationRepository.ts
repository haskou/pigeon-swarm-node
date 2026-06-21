import { ContentReplication } from '../ContentReplication';
import { ContentId } from '../value-objects/ContentId';

export default abstract class ContentReplicationRepository {
  public abstract findAll(): Promise<ContentReplication[]>;
  public abstract findByCid(
    cid: ContentId,
  ): Promise<ContentReplication | undefined>;

  public abstract save(content: ContentReplication): Promise<void>;
}
