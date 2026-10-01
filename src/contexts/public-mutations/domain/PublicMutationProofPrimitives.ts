export type PublicMutationKind = 'put' | 'delete';

export interface PublicMutationAuthorPrimitives {
  identityId: string;
  deviceCredential: string;
}

export interface PublicMutationBodyPrimitives {
  version: 1;
  operationId: string;
  kind: PublicMutationKind;
  store: string;
  recordId: string;
  predecessor: string | null;
  sequence: number;
  payloadDigest: string;
  author: PublicMutationAuthorPrimitives;
}

export interface PublicMutationProofPrimitives extends PublicMutationBodyPrimitives {
  signature: string;
}
