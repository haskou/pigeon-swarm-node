import { IPFSContentReplicationContext } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationPriority } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationPriority';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import IPFSContentReplicationRegistrar from '../register-content/IPFSContentReplicationRegistrar';
import { IPFSContentDocument } from './IPFSContentDocument';
import { IPFSContentPublishMessage } from './messages/IPFSContentPublishMessage';
import { PublishedIPFSContent } from './PublishedIPFSContent';

const defaultContentType = 'application/octet-stream';
const privateUploadContext = 'ipfs_private_upload';
const publicUploadContext = IPFSContentReplicationContext.PUBLIC_UPLOAD;

export default class IPFSContentPublisher {
  constructor(
    private readonly ipfs: IPFS,
    private readonly nodeRepository: NodeRepository,
    private readonly replicationRegistrar: IPFSContentReplicationRegistrar,
  ) {}

  private commonDocument(
    message: IPFSContentPublishMessage,
  ): Omit<IPFSContentDocument, 'encrypted' | 'encryptedData'> {
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
    message: IPFSContentPublishMessage;
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
      priority: IPFSContentReplicationPriority.NORMAL,
      sizeBytes: params.message.body.length,
    });
  }

  private async publish(
    message: IPFSContentPublishMessage,
    document: IPFSContentDocument,
    context: string,
  ): Promise<PublishedIPFSContent> {
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
    message: IPFSContentPublishMessage,
    context: string,
  ): Promise<PublishedIPFSContent> {
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
    message: IPFSContentPublishMessage,
  ): Promise<PublishedIPFSContent> {
    const document: IPFSContentDocument = {
      ...this.commonDocument(message),
      encrypted: true,
      encryptedData: message.body.toString('base64'),
    };

    return this.publish(message, document, privateUploadContext);
  }

  public async publishPublic(
    message: IPFSContentPublishMessage,
  ): Promise<PublishedIPFSContent> {
    return this.publishBytes(message, publicUploadContext);
  }
}
