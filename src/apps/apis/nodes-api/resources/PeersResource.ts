import { ConnectedIpfsPeerResource } from './ConnectedIpfsPeerResource';
import { NetworkSynchronizationStatusResource } from './NetworkSynchronizationStatusResource';
import { PeerResource } from './PeerResource';

export type PeersResource = {
  ipfsPeers: ConnectedIpfsPeerResource[];
  networkSynchronization: NetworkSynchronizationStatusResource;
  peers: PeerResource[];
};
