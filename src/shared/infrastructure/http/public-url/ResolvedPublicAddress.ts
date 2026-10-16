/** One address a public hostname resolved to, already checked by the guard. */
export type ResolvedPublicAddress = {
  address: string;
  family: 4 | 6;
};
