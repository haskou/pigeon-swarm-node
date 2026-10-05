import { PublicMutationAuthorPrimitives } from './PublicMutationAuthorPrimitives';
import { PublicMutationKind } from './PublicMutationKind';

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
