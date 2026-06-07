export type RuntimeConfig = {
  addresses?: {
    announce?: string[];
    listen?: string[];
  };
  peerDiscovery?: unknown[];
  services?: Record<string, unknown>;
  transports?: Array<(...args: unknown[]) => unknown>;
};
