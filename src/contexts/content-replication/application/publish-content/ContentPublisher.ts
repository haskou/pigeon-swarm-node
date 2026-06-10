import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import ContentReplicationRegistrar from '../register-content/ContentReplicationRegistrar';
import { ContentDocument } from './ContentDocument';
import { ContentPublishMessage } from './messages/ContentPublishMessage';
import { PublishedContent } from './PublishedContent';

const defaultContentType = 'application/octet-stream';
const privateUploadContext = 'ipfs_private_upload';
const publicUploadContext = ContentReplicationContext.PUBLIC_UPLOAD;

export default class ContentPublisher {
  constructor(
    private readonly ipfs: IPFS,
    private readonly nodeRepository: NodeRepository,
    private readonly replicationRegistrar: ContentReplicationRegistrar,
  ) {}

  private commonDocument(
    message: ContentPublishMessage,
  ): Omit<ContentDocument, 'encrypted' | 'encryptedData'> {
    return {
      contentType: message.contentType || defaultContentType,
      filename: message.filename,
      size: message.body.length,
      uploadedAt: Date.now(),
      uploadedByIdentityId: message.ownerIdentityId.valueOf(),
    };
  }

  private async networkIds(): Promise<string[]> {
    const networks = await this.ipfs.getNetworks();

    return networks.map((network) => network.getId());
  }

  private async localNodeId(): Promise<string> {
    return (await this.nodeRepository.loadLocalNodeId()).valueOf();
  }

  private async registerReplication(params: {
    cid: string;
    contentType: string;
    context: string;
    filename?: string;
    message: ContentPublishMessage;
    networkIds: string[];
  }): Promise<void> {
    await this.replicationRegistrar.register({
      cid: params.cid,
      contentType: params.contentType,
      context: params.context,
      filename: params.filename,
      localNodeId: await this.localNodeId(),
      networkIds: params.networkIds,
      ownerIdentityId: params.message.ownerIdentityId.valueOf(),
      priority: ContentReplicationPriority.NORMAL,
      sizeBytes: params.message.body.length,
    });
  }

  private async publish(
    message: ContentPublishMessage,
    document: ContentDocument,
    context: string,
  ): Promise<PublishedContent> {
    const cid = await this.ipfs.addJSONToAll(document);

    await this.registerReplication({
      cid: cid.valueOf(),
      contentType: document.contentType,
      context,
      filename: message.filename,
      message,
      networkIds: await this.networkIds(),
    });

    return {
      cid: cid.valueOf(),
      contentType: document.contentType,
      encrypted: document.encrypted,
      filename: message.filename,
      size: message.body.length,
    };
  }

  private async publishBytes(
    message: ContentPublishMessage,
    context: string,
  ): Promise<PublishedContent> {
    const contentType = message.contentType || defaultContentType;
    const cid = await this.ipfs.addBytesToAll(message.body);

    await this.registerReplication({
      cid: cid.valueOf(),
      contentType,
      context,
      filename: message.filename,
      message,
      networkIds: await this.networkIds(),
    });

    return {
      cid: cid.valueOf(),
      contentType,
      filename: message.filename,
      size: message.body.length,
    };
  }

  public async publishPrivate(
    message: ContentPublishMessage,
  ): Promise<PublishedContent> {
    const document: ContentDocument = {
      ...this.commonDocument(message),
      encrypted: true,
      encryptedData: message.body.toString('base64'),
    };

    return this.publish(message, document, privateUploadContext);
  }

  public async publishPublic(
    message: ContentPublishMessage,
  ): Promise<PublishedContent> {
    return this.publishBytes(message, publicUploadContext);
  }
}
