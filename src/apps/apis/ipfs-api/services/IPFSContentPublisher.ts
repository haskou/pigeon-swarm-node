import IPFSContentReplicationRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationRegistrar';
import { IPFSContentReplicationPriority } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationPriority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { IPFSContentTooLargeError } from '../errors/IPFSContentTooLargeError';
import { maxIPFSContentSizeBytes } from '../IPFSContentLimits';

const defaultContentType = 'application/octet-stream';
const privateUploadContext = 'ipfs_private_upload';
const publicUploadContext = 'ipfs_public_upload';

type NodeRepository = {
  loadLocalNode(): Promise<{
    toPrimitives(): {
      id: string;
    };
  }>;
};
type IPFSClient = {
  addJSONToAll(data: unknown): Promise<{
    valueOf(): string;
  }>;
  getNetworks(): Promise<
    {
      getId(): string;
    }[]
  >;
};
type ReplicationRegistrar = Pick<IPFSContentReplicationRegistrar, 'register'>;
type PublishContentParams = {
  body: Buffer;
  contentType?: string;
  filename?: string;
  ownerIdentityId: IdentityId;
};
type PublishedIPFSContent = {
  cid: string;
  contentType: string;
  encrypted?: true;
  filename?: string;
  size: number;
};
type IPFSContentDocument = {
  contentType: string;
  data?: string;
  encrypted?: true;
  encryptedData?: string;
  filename?: string;
  size: number;
  uploadedAt: number;
  uploadedByIdentityId: string;
};

export default class IPFSContentPublisher {
  constructor(
    private readonly ipfs: IPFSClient,
    private readonly nodeRepository: NodeRepository,
    private readonly replicationRegistrar: ReplicationRegistrar,
  ) {}

  private assertContentSize(body: Buffer): void {
    if (body.length > maxIPFSContentSizeBytes) {
      throw new IPFSContentTooLargeError(maxIPFSContentSizeBytes);
    }
  }

  private commonDocument(
    params: PublishContentParams,
  ): Omit<IPFSContentDocument, 'data' | 'encrypted' | 'encryptedData'> {
    return {
      contentType: params.contentType || defaultContentType,
      filename: params.filename,
      size: params.body.length,
      uploadedAt: Date.now(),
      uploadedByIdentityId: params.ownerIdentityId.valueOf(),
    };
  }

  private async networkIds(): Promise<string[]> {
    const networks = await this.ipfs.getNetworks();

    return networks.map((network) => network.getId());
  }

  private async registerReplication(params: {
    cid: string;
    context: string;
    networkIds: string[];
    ownerIdentityId: IdentityId;
    sizeBytes: number;
  }): Promise<void> {
    const localNode = await this.nodeRepository.loadLocalNode();

    await this.replicationRegistrar.register({
      cid: params.cid,
      context: params.context,
      localNodeId: localNode.toPrimitives().id,
      networkIds: params.networkIds,
      ownerIdentityId: params.ownerIdentityId.valueOf(),
      priority: IPFSContentReplicationPriority.NORMAL,
      sizeBytes: params.sizeBytes,
    });
  }

  private async publish(
    params: PublishContentParams,
    document: IPFSContentDocument,
    context: string,
  ): Promise<PublishedIPFSContent> {
    this.assertContentSize(params.body);

    const cid = await this.ipfs.addJSONToAll(document);

    await this.registerReplication({
      cid: cid.valueOf(),
      context,
      networkIds: await this.networkIds(),
      ownerIdentityId: params.ownerIdentityId,
      sizeBytes: params.body.length,
    });

    return {
      cid: cid.valueOf(),
      contentType: document.contentType,
      encrypted: document.encrypted,
      filename: params.filename,
      size: params.body.length,
    };
  }

  public async publishPrivate(
    params: PublishContentParams,
  ): Promise<PublishedIPFSContent> {
    const document: IPFSContentDocument = {
      ...this.commonDocument(params),
      encrypted: true,
      encryptedData: params.body.toString('base64'),
    };

    return this.publish(params, document, privateUploadContext);
  }

  public async publishPublic(
    params: PublishContentParams,
  ): Promise<PublishedIPFSContent> {
    const document: IPFSContentDocument = {
      ...this.commonDocument(params),
      data: params.body.toString('base64'),
    };

    return this.publish(params, document, publicUploadContext);
  }
}
