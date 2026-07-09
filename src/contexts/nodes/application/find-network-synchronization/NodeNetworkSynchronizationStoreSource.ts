export type NodeNetworkSynchronizationStoreSource = {
  getPeerIds(): string[];
  name: string;
  onPeerJoined(listener: () => void): void;
  onPeerLeft(listener: () => void): void;
};
