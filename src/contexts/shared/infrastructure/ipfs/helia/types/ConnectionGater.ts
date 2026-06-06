import { PeerId } from './PeerId';

export type ConnectionGater = {
  denyDialPeer: (peerId: PeerId) => Promise<boolean>;
  denyInboundEncryptedConnection: (peerId: PeerId) => Promise<boolean>;
  denyOutboundConnection: (peerId: PeerId) => Promise<boolean>;
};
