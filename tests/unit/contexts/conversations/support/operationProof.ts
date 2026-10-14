import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

/** Structurally valid operation proof for tests that do not verify the signature. */
export function operationProof(
  recordId = 'operation-id',
  identityId = 'identity-id',
): PublicMutationProof {
  return PublicMutationProof.fromPrimitives({
    author: {
      authorizationRevision: 0,
      deviceCredential: 'device-credential',
      identityId,
    },
    kind: 'put',
    operationId: 'op-conversations-0'.padEnd(22, '0'),
    payloadDigest: PublicMutationProof.digestOf({ recordId }),
    predecessor: null,
    recordId,
    sequence: 0,
    signature:
      'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
    store: 'conversationOperations',
    version: 2,
  });
}
