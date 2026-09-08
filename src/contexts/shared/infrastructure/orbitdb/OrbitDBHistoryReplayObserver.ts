export interface OrbitDBHistoryReplayObserver {
  started(): void;
  finished(success: boolean): void;
}
