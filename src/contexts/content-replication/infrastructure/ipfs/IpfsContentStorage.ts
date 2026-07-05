import ReplicatedContentStorage, {
  ReplicatedContentUpload,
} from '@app/contexts/content-replication/application/content-storage/ReplicatedContentStorage';
import { ReplicatedContentNotFoundError } from '@app/contexts/content-replication/domain/errors/ReplicatedContentNotFoundError';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSContentNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

export default class IpfsContentStorage extends ReplicatedContentStorage {
  constructor(private readonly ipfs: IPFS) {
    super();
  }

  private toIpfsId(contentId: ContentId): IPFSId {
    return new IPFSId(contentId.valueOf());
  }

  private toContentId(ipfsId: IPFSId): ContentId {
    return new ContentId(ipfsId.valueOf());
  }

  private async translateNotFound<T>(
    contentId: ContentId,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof IPFSContentNotFoundError) {
        throw new ReplicatedContentNotFoundError(contentId);
      }

      throw error;
    }
  }

  public findBytes(contentId: ContentId): Promise<Buffer> {
    return this.translateNotFound(contentId, () =>
      this.ipfs.getBytes(this.toIpfsId(contentId)),
    );
  }

  public findJSON<T>(contentId: ContentId): Promise<T> {
    return this.translateNotFound(contentId, () =>
      this.ipfs.getJSON<T>(this.toIpfsId(contentId)),
    );
  }

  public findBytesInNetwork(
    contentId: ContentId,
    networkId: NetworkId,
  ): Promise<Buffer> {
    return this.translateNotFound(contentId, () =>
      this.ipfs.getBytesFromNetwork(
        this.toIpfsId(contentId),
        networkId.valueOf(),
      ),
    );
  }

  public findJSONInNetwork<T>(
    contentId: ContentId,
    networkId: NetworkId,
  ): Promise<T> {
    return this.translateNotFound(contentId, () =>
      this.ipfs.getJSONFromNetwork<T>(
        this.toIpfsId(contentId),
        networkId.valueOf(),
      ),
    );
  }

  public async provideInNetwork(
    contentId: ContentId,
    networkId: NetworkId,
  ): Promise<void> {
    await this.translateNotFound(contentId, async () => {
      const ipfsId = this.toIpfsId(contentId);
      const hasLocalContent = await this.ipfs.stat(ipfsId, true, [
        networkId.valueOf(),
      ]);

      if (!hasLocalContent) {
        throw new IPFSContentNotFoundError(contentId.valueOf());
      }

      await this.ipfs.provideContentFromNetwork(ipfsId, networkId.valueOf());
    });
  }

  public isRawContent(contentId: ContentId): Promise<boolean> {
    return this.ipfs.isRawCid(this.toIpfsId(contentId));
  }

  public async publishDocument(document: unknown): Promise<ContentId> {
    return this.toContentId(await this.ipfs.addJSONToAll(document));
  }

  public async publishDocumentToNetwork(
    document: unknown,
    networkId: NetworkId,
  ): Promise<ContentId> {
    return this.toContentId(
      await this.ipfs.addJSON(document, networkId.valueOf()),
    );
  }

  public async publishBytesToNetworks(
    bytes: Uint8Array,
    networkIds: NetworkId[],
  ): Promise<ReplicatedContentUpload> {
    const upload = await this.ipfs.addBytesToNetworksReturningFirst(
      bytes,
      networkIds.map((networkId) => networkId.valueOf()),
    );

    return {
      completedNetworkIds: upload.completedNetworkIds.then((ids) =>
        ids.map((id) => new NetworkId(id)),
      ),
      contentId: this.toContentId(upload.cid),
      networkId: new NetworkId(upload.networkId),
    };
  }

  public removeFromNetwork(
    contentId: ContentId,
    networkId: NetworkId,
  ): Promise<void> {
    return this.ipfs.removeJSONFromNetwork(
      this.toIpfsId(contentId),
      networkId.valueOf(),
    );
  }

  public async findNetworkIds(): Promise<NetworkId[]> {
    return (await this.ipfs.getNetworks()).map(
      (network) => new NetworkId(network.getId()),
    );
  }
}
