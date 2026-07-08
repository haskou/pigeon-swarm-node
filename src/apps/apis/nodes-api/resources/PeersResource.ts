import { ConnectedIpfsPeerResource } from './ConnectedIpfsPeerResource';
import { PeerResource } from './PeerResource';

export type PeersResource = {
  ipfsPeers: ConnectedIpfsPeerResource[];
  peers: PeerResource[];
};
