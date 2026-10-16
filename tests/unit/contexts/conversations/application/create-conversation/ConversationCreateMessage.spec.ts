import { ConversationCreateMessage } from '@app/contexts/conversations/application/create-conversation/messages/ConversationCreateMessage';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { InvalidLengthError } from '@haskou/value-objects';

import { signConversationOperation } from '../../../../../support/signConversationOperation';

const networkId = '0f6d8a52-3c4b-4e0e-9a8f-5b2c7d1e4a90';

async function identity(): Promise<{ id: string; keyPair: KeyPair }> {
  const keyPair = await KeyPair.generate();

  return {
    id: new IdentityId(keyPair.toPrimitives().publicKey).valueOf(),
    keyPair,
  };
}

describe('ConversationCreateMessage', () => {
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

  it('builds the genesis of the conversation between two identities', async () => {
    const owner = await identity();
    const { operation, other } = await genesisBetween(owner);

    const message = new ConversationCreateMessage(owner.id, {
      keychainExternalIdentifier: 'keychain',
      networkId,
      operation,
      participantIds: [other.id],
    });

    expect(message.genesis.getConversationId().valueOf()).toBe(
      ConversationId.deterministic(owner.id, other.id, networkId).valueOf(),
    );
  });

  it.each(['not:an-identity', ''])(
    'refuses the participant %p as an invalid identity',
    async (participantId) => {
      const owner = await identity();
      const { operation } = await genesisBetween(owner);

      expect(
        () =>
          new ConversationCreateMessage(owner.id, {
            keychainExternalIdentifier: 'keychain',
            networkId,
            operation,
            participantIds: [participantId],
          }),
      ).toThrow(InvalidLengthError);
    },
  );
});
