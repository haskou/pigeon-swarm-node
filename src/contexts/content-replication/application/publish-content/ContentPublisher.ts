import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import { ContentDocument } from './ContentDocument';
import { ContentPublishMessage } from './messages/ContentPublishMessage';
import { PrivateContentPublishMessage } from './messages/PrivateContentPublishMessage';
import { PublishedContent } from './PublishedContent';

const defaultContentType = 'application/octet-stream';

/**
 * Stores uploaded bytes on this node. Replication to other nodes is a separate,
 * owner-signed registration: an upload alone never announces anything.
 */
export default class ContentPublisher {
  constructor(
    private readonly contentStorage: ReplicatedContentStorage,
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

  private async ownerNetworkIds(
    ownerIdentityId: IdentityId,
  ): Promise<NetworkId[]> {
    const identity = await this.identityRepository.findById(ownerIdentityId);

    return identity.getNetworkIds();
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
    const { contentId } = await this.contentStorage.publishBytesToNetworks(
      message.body,
      await this.ownerNetworkIds(message.ownerIdentityId),
    );

    return {
      cid: contentId.valueOf(),
      contentType: message.contentType || defaultContentType,
      filename: message.filename,
      size: message.body.length,
    };
  }
}
