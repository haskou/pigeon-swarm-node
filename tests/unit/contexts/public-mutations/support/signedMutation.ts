import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

let device: KeyPair | undefined;

/** Builds a structurally valid, device-signed proof for repository tests. */
export async function signedMutation(options: {
  identityId: string;
  kind: 'put' | 'delete';
  payload?: Record<string, unknown>;
  recordId: string;
  sequence: number;
  store: string;
}): Promise<PublicMutationProof> {
  device ??= await KeyPair.generate();
  const body = {
    author: {
      deviceCredential: device.toPrimitives().publicKey,
      identityId: options.identityId,
    },
    kind: options.kind,
    operationId: `op-${options.store}-${options.sequence}`.padEnd(22, '0'),
    payloadDigest: PublicMutationProof.digestOf(options.payload ?? {}),
    predecessor:
      options.sequence === 0
        ? null
        : PublicMutationProof.digestOf({ previous: options.sequence }),
    recordId: options.recordId,
    sequence: options.sequence,
    store: options.store,
    version: 1,
  } as const;

  return PublicMutationProof.signed(
    body,
    device.sign(PublicMutationProof.signingContentOf(body)),
  );
}
