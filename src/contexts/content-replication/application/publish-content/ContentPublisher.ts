import { ContentReplicaUploadCompletion } from '@app/contexts/content-replication/domain/ContentReplicaUploadCompletion';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import Kernel from '@haskou/ddd-kernel';

import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import ContentReplicationRegistrar from '../register-content/ContentReplicationRegistrar';
import { ContentDocument } from './ContentDocument';
import { ContentPublishMessage } from './messages/ContentPublishMessage';
import { PrivateContentPublishMessage } from './messages/PrivateContentPublishMessage';
import { PublishedContent } from './PublishedContent';

const defaultContentType = 'application/octet-stream';
const privateUploadContext = 'ipfs_private_upload';
const publicUploadContext = ContentReplicationContext.PUBLIC_UPLOAD;

export default class ContentPublisher {
  constructor(
    private readonly contentStorage: ReplicatedContentStorage,
    private readonly nodeRepository: NodeRepository,
    private readonly replicationRegistrar: ContentReplicationRegistrar,
    private readonly identityRepository: IdentityRepository,
  ) {}

  private commonDocument(
    message: ContentPublishMessage | PrivateContentPublishMessage,
  ): Omit<ContentDocument, 'encrypted' | 'encryptedData'> {
    return {
      contentType: message.contentType || defaultContentType,
      filename: message.filename,
      size: message.body.length,
      uploadedAt: Date.now(),
      uploadedByIdentityId: message.ownerIdentityId.valueOf(),
    };
  }

  private async networkIds(): Promise<NetworkId[]> {
    return this.contentStorage.findNetworkIds();
  }

  private async ownerNetworkIds(
    ownerIdentityId: IdentityId,
  ): Promise<NetworkId[]> {
    const identity = await this.identityRepository.findById(ownerIdentityId);

    return identity.getNetworkIds();
  }

  private async localNodeId(): Promise<string> {
    return (await this.nodeRepository.loadLocalNodeId()).valueOf();
  }

  private async registerReplication(params: {
    claimedNetworkIds?: string[];
    cid: string;
    contentType: string;
    context: string;
    deferSideEffects?: boolean;
    filename?: string;
    message: ContentPublishMessage | PrivateContentPublishMessage;
    networkIds: NetworkId[];
  }): Promise<void> {
    await this.replicationRegistrar.register({
      cid: params.cid,
      contentType: params.contentType,
      context: params.context,
      deferSideEffects: params.deferSideEffects,
      filename: params.filename,
      localNodeId: await this.localNodeId(),
      localReplicaNetworkIds: params.claimedNetworkIds,
      networkIds: params.networkIds.map((networkId) => networkId.valueOf()),
      ownerIdentityId: params.message.ownerIdentityId.valueOf(),
      priority: ContentReplicationPriority.NORMAL,
      sizeBytes: params.message.body.length,
    });
  }

  private async registerUploadedBytesReplication(params: {
    cid: string;
    claimedNetworkIds: string[];
    completedNetworkIds: Promise<NetworkId[]>;
    contentType: string;
    context: string;
    filename?: string;
    message: ContentPublishMessage;
    networkIds: NetworkId[];
  }): Promise<void> {
    const firstRegistration = this.registerReplication({
      ...params,
      deferSideEffects: true,
    });

    await firstRegistration;
    params.completedNetworkIds
      .then(async (completedNetworkIds) => {
        const completion = new ContentReplicaUploadCompletion(
          params.claimedNetworkIds.map((networkId) => new NetworkId(networkId)),
          completedNetworkIds,
        );

        if (!completion.hasPendingClaims()) {
          return;
        }

        await this.registerReplication({
          ...params,
          claimedNetworkIds: completion
            .pendingClaimedNetworkIds()
            .map((networkId) => networkId.valueOf()),
          deferSideEffects: true,
        });
      })
      .catch((error: unknown): void => {
        Kernel.logger.warn?.(
          `Content replication upload completion registration failed: cid=${params.cid} error=${String(error)}`,
        );
      });
  }

  private async publish(
    message: ContentPublishMessage,
    document: ContentDocument,
    context: string,
  ): Promise<PublishedContent> {
    const cid = await this.contentStorage.publishDocument(document);

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
    const networkIds = await this.ownerNetworkIds(message.ownerIdentityId);
    const { completedNetworkIds, contentId, networkId } =
      await this.contentStorage.publishBytesToNetworks(
        message.body,
        networkIds,
      );

    await this.registerUploadedBytesReplication({
      cid: contentId.valueOf(),
      claimedNetworkIds: [networkId.valueOf()],
      completedNetworkIds,
      contentType,
      context,
      filename: message.filename,
      message,
      networkIds,
    });

    return {
      cid: contentId.valueOf(),
      contentType,
      filename: message.filename,
      size: message.body.length,
    };
  }

  public async publishPrivate(
    message: PrivateContentPublishMessage,
  ): Promise<PublishedContent> {
    const document: ContentDocument = {
      ...this.commonDocument(message),
      encrypted: true,
      encryptedData: message.body.toString('base64'),
    };
    const cid = await this.contentStorage.publishDocumentToNetwork(
      document,
      message.networkId,
    );

    await this.registerReplication({
      cid: cid.valueOf(),
      claimedNetworkIds: [message.networkId.valueOf()],
      contentType: document.contentType,
      context: privateUploadContext,
      filename: message.filename,
      message,
      networkIds: [message.networkId],
    });

    return {
      cid: cid.valueOf(),
      contentType: document.contentType,
      encrypted: document.encrypted,
      filename: message.filename,
      size: message.body.length,
    };
  }

  public async publishPublic(
    message: ContentPublishMessage,
  ): Promise<PublishedContent> {
    return this.publishBytes(message, publicUploadContext);
  }
}
