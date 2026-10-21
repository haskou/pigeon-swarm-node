/**
 * Where a held head is delivered once its gated records prove out.
 * `headKey` is the head's own key, without any alias, so the copies held for
 * one head, and the community heads that rest on it, can be found by it.
 */
export type OrbitDBHeadReadmission = {
  headKey: string;
  networkId: string;
  onAdmitted(admitted: Record<string, unknown>): void | Promise<void>;
  /**
   * Set for a head restored from this node's own persisted head cache. Only
   * such a copy settles a key whose own copy still waits.
   */
  own?: boolean;
};
