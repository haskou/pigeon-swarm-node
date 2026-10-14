/**
 * Where a demoted head is delivered once readmitted. `key` names the head
 * and its delivery path; with the head value it identifies a pending
 * readmission, so a copy received again is not scheduled twice.
 */
export type OrbitDBHeadReadmission = {
  key?: string;
  networkId: string;
  onReadmitted(admitted: Record<string, unknown>): void | Promise<void>;
};
