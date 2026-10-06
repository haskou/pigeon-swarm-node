import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ConversationOperation } from '../../../domain/operations/ConversationOperation';
import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { ConversationOperationAction } from '../../../domain/value-objects/ConversationOperationAction';
import { ConversationOperationMutation } from '../../record-operation/ConversationOperationMutation';
import { ConversationOperationMutationPrimitives } from '../../record-operation/ConversationOperationMutationPrimitives';

/**
 * Creates a conversation from the genesis operation its creator signed. The
 * participants are the creator plus the requested ones, deduplicated and
 * sorted, which is the exact list the client must have signed.
 */
export class ConversationCreateMessage {
  public readonly genesis: ConversationOperation;
  public readonly keychainExternalIdentifier: KeychainExternalIdentifier;
  public readonly operation: ConversationOperationMutation;
  public readonly ownerIdentityId: IdentityId;

  constructor(
    ownerIdentityId: string,
    payload: {
      keychainExternalIdentifier: string;
      name?: string;
      networkId: string;
      nonce?: string;
      operation: ConversationOperationMutationPrimitives;
      participantIds: string[];
      type: 'group' | 'one-to-one';
    },
  ) {
    const network = new NetworkId(payload.networkId);
    const participantIds = [
      ...new Set([ownerIdentityId, ...payload.participantIds]),
    ].sort();

    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.keychainExternalIdentifier = new KeychainExternalIdentifier(
      payload.keychainExternalIdentifier,
    );
    this.operation = new ConversationOperationMutation(payload.operation);
    this.genesis = this.operation.build({
      action: ConversationOperationAction.CONVERSATION_CREATED,
      args:
        payload.type === 'group'
          ? {
              name: payload.name ?? '',
              nonce: payload.nonce ?? '',
              participantIds,
              type: 'group',
            }
          : { participantIds, type: 'one-to-one' },
      author: this.ownerIdentityId,
      conversationId:
        payload.type === 'group'
          ? ConversationId.deriveGroup(
              network.valueOf(),
              ownerIdentityId,
              payload.nonce ?? '',
            )
          : ConversationId.deterministic(
              participantIds[0],
              participantIds[1] ?? participantIds[0],
              network,
            ),
      networkId: network,
    });
  }
}
