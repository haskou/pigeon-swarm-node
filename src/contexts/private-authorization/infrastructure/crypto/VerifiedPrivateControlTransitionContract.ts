import { VerifiedPrivateControlPolicy } from './VerifiedPrivateControlPolicy';

export interface VerifiedTransition {
  headHash: string;
  mlsEpoch: number;
  parentHeadHash: string;
  policy: VerifiedPrivateControlPolicy;
  revision: number;
  scopeId: string;
}
