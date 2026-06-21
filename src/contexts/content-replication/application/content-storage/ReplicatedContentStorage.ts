import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ContentId } from '../../domain/value-objects/ContentId';

export type ReplicatedContentUpload = {
  completedNetworkIds: Promise<NetworkId[]>;
  contentId: ContentId;
  networkId: NetworkId;
};

export default abstract class ReplicatedContentStorage {
  public abstract findBytes(contentId: ContentId): Promise<Buffer>;

  public abstract findJSON<T>(contentId: ContentId): Promise<T>;

  public abstract findBytesInNetwork(
    contentId: ContentId,
    networkId: NetworkId,
  ): Promise<Buffer>;

  public abstract findJSONInNetwork<T>(
    contentId: ContentId,
    networkId: NetworkId,
  ): Promise<T>;

  public abstract isRawContent(contentId: ContentId): Promise<boolean>;

  public abstract publishDocument(document: unknown): Promise<ContentId>;

  public abstract publishBytesToNetworks(
    bytes: Uint8Array,
    networkIds: NetworkId[],
  ): Promise<ReplicatedContentUpload>;

  public abstract removeFromNetwork(
    contentId: ContentId,
    networkId: NetworkId,
  ): Promise<void>;

  public abstract findNetworkIds(): Promise<NetworkId[]>;
}
