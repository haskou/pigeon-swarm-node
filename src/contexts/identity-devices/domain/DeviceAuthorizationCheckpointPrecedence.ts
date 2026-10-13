/**
 * The outcome of checkpoint precedence: the preferred checkpoint and every
 * checkpoint contending with it at its revision on its lineage, preferred
 * first, in precedence order.
 */
export interface DeviceAuthorizationCheckpointPrecedence<T> {
  contenders: T[];
  preferred: T;
}
