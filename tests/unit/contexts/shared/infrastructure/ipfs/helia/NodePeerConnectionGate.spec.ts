import { NodePeerConnectionGate } from '@app/contexts/shared/infrastructure/ipfs/helia/NodePeerConnectionGate';
import { PeerId } from '@app/contexts/shared/infrastructure/ipfs/helia/types/PeerId';

import {
  NODE_PEER_ID_A,
  NODE_PEER_ID_B,
} from '../../../../../mothers/NodeBlockListMother';

const peer = (id: string): PeerId => ({ toString: () => id }) as PeerId;

describe('NodePeerConnectionGate', () => {
  let gate: NodePeerConnectionGate;

  beforeEach(() => {
    gate = new NodePeerConnectionGate();
  });

  it('should deny inbound and outbound connections of blocked peers only', async () => {
    const gater = gate.connectionGater();

    await gate.replace([NODE_PEER_ID_A]);

    await expect(gater.denyDialPeer?.(peer(NODE_PEER_ID_A))).resolves.toBe(
      true,
    );
    await expect(
      gater.denyInboundEncryptedConnection?.(peer(NODE_PEER_ID_A)),
    ).resolves.toBe(true);
    await expect(
      gater.denyOutboundConnection?.(peer(NODE_PEER_ID_A)),
    ).resolves.toBe(true);
    await expect(gater.denyDialPeer?.(peer(NODE_PEER_ID_B))).resolves.toBe(
      false,
    );
  });

  it('should allow a peer again once it is unblocked', async () => {
    const gater = gate.connectionGater();

    await gate.replace([NODE_PEER_ID_A]);
    await gate.replace([]);

    await expect(gater.denyDialPeer?.(peer(NODE_PEER_ID_A))).resolves.toBe(
      false,
    );
  });

  it('should report and notify only newly blocked peers', async () => {
    const listener = jest.fn().mockResolvedValue(undefined);

    gate.onPeersBlocked(listener);
    await gate.replace([NODE_PEER_ID_A]);

    await expect(
      gate.replace([NODE_PEER_ID_A, NODE_PEER_ID_B]),
    ).resolves.toEqual([NODE_PEER_ID_B]);
    expect(listener.mock.calls).toEqual([
      [[NODE_PEER_ID_A]],
      [[NODE_PEER_ID_B]],
    ]);
  });
});
