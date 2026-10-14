/**
 * Where a demoted head is delivered once readmitted. `key` names the head
 * and its delivery path: a newer demoted value of the same key replaces the
 * pending one.
 */
export type OrbitDBHeadReadmission = {
  key?: string;
  networkId: string;
  onReadmitted(admitted: Record<string, unknown>): void | Promise<void>;
};
