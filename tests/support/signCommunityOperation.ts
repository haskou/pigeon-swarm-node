import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { randomBytes } from 'node:crypto';

export interface CommunityOperationSigner {
  deviceCredential: string;
  deviceKeyPair: KeyPair;
  id: string;
}

/** The `operation` field every community-mutating request carries. */
export interface SignedCommunityOperationBody {
  createdAt: number;
  mutation: Record<string, unknown>;
  parents: string[];
}

export interface SignedCommunityOperation {
  body: SignedCommunityOperationBody;
  operation: CommunityOperation;
  proof: PublicMutationProof;
}

/**
 * Builds and signs a `communityOperations` put the way a client does: the
 * payload is the operation, the proof binds it to the signer's device.
 */
export function signCommunityOperation(input: {
  action: string;
  args: Record<string, unknown>;
  communityId: string;
  createdAt: number;
  networkId: string;
  parents: string[];
  signer: CommunityOperationSigner;
}): SignedCommunityOperation {
  const operation = CommunityOperation.create({
    action: new CommunityOperationAction(input.action),
    args: input.args,
    authorIdentityId: new IdentityId(input.signer.id),
    communityId: new CommunityId(input.communityId),
    createdAt: input.createdAt,
    networkId: new NetworkId(input.networkId),
    parents: input.parents,
  });
  const payload = operation.toPrimitives();
  const body = {
    author: {
      deviceCredential: input.signer.deviceCredential,
      identityId: input.signer.id,
    },
    kind: 'put',
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor: null as string | null,
    recordId: operation.getId(),
    sequence: 0,
    store: 'communityOperations',
    version: 1,
  } as const;
  const proof = PublicMutationProof.signed(
    body,
    input.signer.deviceKeyPair.sign(PublicMutationProof.signingContentOf(body)),
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
