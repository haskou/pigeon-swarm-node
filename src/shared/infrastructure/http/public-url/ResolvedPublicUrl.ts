import { ResolvedPublicAddress } from './ResolvedPublicAddress';

export type ResolvedPublicUrl = {
  /** Every address the hostname resolved to, in resolver order. */
  addresses: ResolvedPublicAddress[];
  url: URL;
};
