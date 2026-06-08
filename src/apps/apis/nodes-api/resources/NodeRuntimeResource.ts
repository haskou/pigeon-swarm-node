export type NodeRuntimeResource = {
  logLevel?: string;
  transport: 'in-memory' | 'libp2p-gossipsub' | 'unknown';
};
