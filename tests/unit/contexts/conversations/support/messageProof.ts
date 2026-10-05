import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

/** Structurally valid proof for tests that do not verify the signature. */
export function messageProof(
  recordId = 'message-id',
  identityId = 'identity-id',
): PublicMutationProof {
  return PublicMutationProof.fromPrimitives({
    author: { deviceCredential: 'device-credential', identityId },
    kind: 'put',
    operationId: 'op-messages-0'.padEnd(22, '0'),
    payloadDigest: PublicMutationProof.digestOf({ recordId }),
    predecessor: null,
    recordId,
    sequence: 0,
    signature:
      'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
    store: 'messages',
    version: 1,
  });
}
