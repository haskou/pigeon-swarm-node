import ConversationCreator from '@app/contexts/conversations/application/create-conversation/ConversationCreator';
import { ConversationCreateMessage } from '@app/contexts/conversations/application/create-conversation/messages/ConversationCreateMessage';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import { PrivateNetworkRequiredError } from '@app/contexts/shared/domain/errors/PrivateNetworkRequiredError';
import NetworkPrivacyDirectory from '@app/contexts/shared/domain/networks/NetworkPrivacyDirectory';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

import { signConversationOperation } from '../../../../../support/signConversationOperation';

const networkId = '0f6d8a52-3c4b-4e0e-9a8f-5b2c7d1e4a90';

async function identity(): Promise<{ id: string; keyPair: KeyPair }> {
  const keyPair = await KeyPair.generate();

  return {
    id: new IdentityId(keyPair.toPrimitives().publicKey).valueOf(),
    keyPair,
  };
}

async function genesisBetween(owner: { id: string; keyPair: KeyPair }) {
  const other = await identity();
  const participantIds = [owner.id, other.id].sort();
  const signed = signConversationOperation({
    action: 'conversation_created',
    args: { participantIds, type: 'one-to-one' },
    conversationId: ConversationId.deterministic(
      participantIds[0],
      participantIds[1],
      networkId,
    ).valueOf(),
    createdAt: Date.now(),
    networkId,
    parents: [],
    signer: {
      deviceCredential: owner.keyPair.toPrimitives().publicKey,
      deviceKeyPair: owner.keyPair,
      id: owner.id,
    },
  });

  return { operation: signed.body, other };
}

async function createMessage(): Promise<ConversationCreateMessage> {
  const owner = await identity();
  const { operation, other } = await genesisBetween(owner);

  return new ConversationCreateMessage(owner.id, {
    keychainExternalIdentifier: 'keychain',
    networkId,
    operation,
    participantIds: [other.id],
  });
}

function creator(networkIsPrivate: boolean) {
  const conversationRepository = mock<ConversationRepository>();
  const keychainRepository = mock<KeychainRepository>();
  const keychainValidator = mock<KeychainCandidateValidationDomainService>();
  const networkPrivacy = mock<NetworkPrivacyDirectory>();

  keychainRepository.hasByExternalIdentifier.mockResolvedValue(true);
  keychainRepository.requireByExternalIdentifier.mockResolvedValue(
    mock<Keychain>(),
  );
  keychainValidator.isValidChainFor.mockResolvedValue(true);
  networkPrivacy.isPrivate.mockReturnValue(networkIsPrivate);

  return {
    conversationRepository,
    creator: new ConversationCreator(
      conversationRepository,
      keychainRepository,
      keychainValidator,
      networkPrivacy,
    ),
  };
}

describe('ConversationCreator', () => {
  it('refuses a direct conversation placed on a public network', async () => {
    const { conversationRepository, creator: conversationCreator } =
      creator(false);
    conversationRepository.hasById
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      conversationCreator.create(await createMessage()),
    ).rejects.toBeInstanceOf(PrivateNetworkRequiredError);

    expect(conversationRepository.saveOperation).not.toHaveBeenCalled();
  });

  it('refuses an existing direct conversation stored on a public network instead of returning it', async () => {
    const { conversationRepository, creator: conversationCreator } =
      creator(false);
    conversationRepository.hasById.mockResolvedValue(true);

    await expect(
      conversationCreator.create(await createMessage()),
    ).rejects.toBeInstanceOf(PrivateNetworkRequiredError);

    expect(conversationRepository.requireMetadataById).not.toHaveBeenCalled();
  });

  it('records a direct conversation placed on a private network', async () => {
    const { conversationRepository, creator: conversationCreator } =
      creator(true);
    conversationRepository.hasById
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const message = await createMessage();

    await conversationCreator.create(message);

    expect(conversationRepository.saveOperation).toHaveBeenCalledWith(
      message.genesis,
      message.operation.proof,
    );
  });
});
