// eslint-disable-next-line max-len
import IdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';

import { KeychainNotFoundError } from '../../domain/errors/KeychainNotFoundError';
import KeychainSyncResponder from '../respond-sync/KeychainSyncResponder';
import { KeychainSyncResponseMessage } from '../respond-sync/messages/KeychainSyncResponseMessage';
import { KeychainNetworkSyncResponseMessage } from './messages/KeychainNetworkSyncResponseMessage';

export default class KeychainNetworkSyncResponder {
  constructor(
    private readonly identityMetadataRepository: IdentityMetadataRepository,
    private readonly keychainSyncResponder: KeychainSyncResponder,
  ) {}

  private async respondToOwner(
    ownerIdentityId: string,
    requestId: string | undefined,
  ): Promise<void> {
    try {
      await this.keychainSyncResponder.respond(
        new KeychainSyncResponseMessage(ownerIdentityId, requestId),
      );
    } catch (error) {
      if (error instanceof KeychainNotFoundError) {
        return;
      }

      throw error;
    }
  }

  public async respond(
    message: KeychainNetworkSyncResponseMessage,
  ): Promise<void> {
    const identities =
      await this.identityMetadataRepository.findLatestByNetworkId(
        message.networkId,
      );

    for (const identity of identities) {
      await this.respondToOwner(identity.identityId, message.requestId);
    }
  }
}
