import { CallPrimitives } from './CallPrimitives';

export interface FoldedCall {
  /** Digest of the signed start payload; the tie-break between community starts. */
  digest: string;
  primitives: CallPrimitives;
}
