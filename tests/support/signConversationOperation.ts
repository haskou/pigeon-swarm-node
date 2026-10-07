import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { randomBytes } from 'node:crypto';

export interface ConversationOperationSigner {
  deviceCredential: string;
  deviceKeyPair: KeyPair;
  id: string;
}

/** The `operation` field every conversation-mutating request carries. */
export interface SignedConversationOperationBody {
  createdAt: number;
  mutation: Record<string, unknown>;
  parents: string[];
}

export interface SignedConversationOperation {
  body: SignedConversationOperationBody;
  operation: ConversationOperation;
  proof: PublicMutationProof;
}

/** Signs any record as a `conversationOperations` put, even one the domain would refuse to build. */
export function signConversationOperationRecord(
  payload: { id: string } & Record<string, unknown>,
  signer: ConversationOperationSigner,
): PublicMutationProof {
  const body = {
    author: {
      authorizationRevision: 0,
      deviceCredential: signer.deviceCredential,
      identityId: signer.id,
    },
    kind: 'put',
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor: null as string | null,
    recordId: payload.id,
    sequence: 0,
    store: 'conversationOperations',
    version: 2,
  } as const;

  return PublicMutationProof.signed(
    body,
    signer.deviceKeyPair.sign(PublicMutationProof.signingContentOf(body)),
  );
}

/**
 * Builds and signs a `conversationOperations` put the way a client does: the
 * payload is the operation, the proof binds it to the signer's device.
 */
export function signConversationOperation(input: {
  action: string;
  args: Record<string, unknown>;
  conversationId: string;
  createdAt: number;
  networkId: string;
  parents: string[];
  signer: ConversationOperationSigner;
}): SignedConversationOperation {
  const operation = ConversationOperation.create({
    action: new ConversationOperationAction(input.action),
    args: input.args,
    authorIdentityId: new IdentityId(input.signer.id),
    conversationId: new ConversationId(input.conversationId),
    createdAt: input.createdAt,
    networkId: new NetworkId(input.networkId),
    parents: input.parents,
  });
  const proof = signConversationOperationRecord(
    operation.toPrimitives(),
    input.signer,
  );

  return {
    body: {
      createdAt: input.createdAt,
      mutation: proof.toPrimitives() as unknown as Record<string, unknown>,
      parents: operation.getParents(),
    },
    operation,
    proof,
  };
}
