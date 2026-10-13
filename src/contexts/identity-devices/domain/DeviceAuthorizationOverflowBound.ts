/**
 * The bound a replicated device-authorization history must fit, measured over
 * ordered sources. An overflow is witnessed only by sources exceeding it.
 */
export interface DeviceAuthorizationOverflowBound<T> {
  /** Whether the projection the sources replay to fits the bound. */
  fitsProjection(sources: T[]): boolean;
  /** Whether the history the sources replay to fits the bound. */
  fitsReplayedHistory(sources: T[]): boolean;
  /** Whether the sources themselves fit the bound. */
  fitsSources(sources: T[]): boolean;
}
