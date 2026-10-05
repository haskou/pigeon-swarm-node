import { PublicMutationBodyPrimitives } from './PublicMutationBodyPrimitives';

export interface PublicMutationProofPrimitives extends PublicMutationBodyPrimitives {
  signature: string;
}
