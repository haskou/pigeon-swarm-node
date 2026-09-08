export interface OrbitDBHistoryReplayObserver {
  started(scope: object): void;
  finished(scope: object, success: boolean): void;
}
