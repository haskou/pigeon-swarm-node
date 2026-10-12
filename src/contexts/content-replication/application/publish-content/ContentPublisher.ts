import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import { ContentPublishMessage } from './messages/ContentPublishMessage';
import { PublishedContent } from './PublishedContent';

const defaultContentType = 'application/octet-stream';

/**
 * Stores uploaded public bytes on this node. Replication to other nodes is a
 * separate, owner-signed registration: an upload alone never announces anything.
 * Private content lives in private blobs and never enters IPFS.
 */
export default class ContentPublisher {
  constructor(
    private readonly contentStorage: ReplicatedContentStorage,
    private readonly identityRepository: IdentityRepository,
  ) {}

  private async ownerNetworkIds(
    ownerIdentityId: IdentityId,
  ): Promise<NetworkId[]> {
    const identity = await this.identityRepository.findById(ownerIdentityId);

    return identity.getNetworkIds();
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
