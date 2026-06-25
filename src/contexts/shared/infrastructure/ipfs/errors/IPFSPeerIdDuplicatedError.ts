import { BaseError } from '@haskou/ddd-kernel/domain';

export class IPFSPeerIdDuplicatedError extends BaseError {
  constructor(
    peerId: string,
    existingNetwork: string,
    duplicatedNetwork: string,
  ) {
    super(
      `PeerId '${peerId}' is already registered in network '${existingNetwork}' and cannot be reused in network '${duplicatedNetwork}'.`,
    );
  }
}
