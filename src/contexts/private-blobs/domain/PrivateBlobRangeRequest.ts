/**
 * A single byte window asked for by a caller, already parsed from its transport.
 * `invalid` covers requests that no blob size can satisfy.
 */
export type PrivateBlobRangeRequest =
  | { kind: 'suffix'; length: number }
  | { first: number; kind: 'from'; last?: number }
  | { kind: 'invalid' };
