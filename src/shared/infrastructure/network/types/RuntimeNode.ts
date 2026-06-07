import { ListenerTarget } from './ListenerTarget';

export type RuntimeNode = ListenerTarget & {
  getConnections?: () => unknown[];
  getMultiaddrs?: () => unknown[];
  getPeers?: () => unknown[];
  peerId?: { toString(): string };
  services?: Record<string, unknown>;
};
