import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import RuntimeNodeBlockEnforcer from '@app/contexts/nodes/infrastructure/blocking/RuntimeNodeBlockEnforcer';
import { nodePeerConnectionGate } from '@app/contexts/shared/infrastructure/ipfs/helia/NodePeerConnectionGate';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';

import {
  NODE_PEER_ID_A,
  NODE_PEER_ID_B,
} from '../../../../mothers/NodeBlockListMother';

describe('RuntimeNodeBlockEnforcer', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await nodePeerConnectionGate.replace([]);
  });

  it('should disconnect every peer on every network even when one disconnect fails', async () => {
    const failing = {
      disconnectPeer: jest.fn().mockRejectedValue(new Error('stopped')),
    };
    const working = { disconnectPeer: jest.fn().mockResolvedValue(undefined) };
    const registry = {
      getAll: () => [failing, working],
      getSharedPeerPrivateKey: jest.fn().mockResolvedValue('key'),
    } as unknown as IPFSNetworkRegistry;

    jest
      .spyOn(libp2pKeyAdapter, 'peerIdFromPrivateKey')
      .mockReturnValue('own' as never);

    await expect(
      new RuntimeNodeBlockEnforcer(registry).enforce(
        [],
        [new NodePeerId(NODE_PEER_ID_A), new NodePeerId(NODE_PEER_ID_B)],
      ),
    ).resolves.toBeUndefined();
    expect(working.disconnectPeer.mock.calls).toEqual([
      [NODE_PEER_ID_A],
      [NODE_PEER_ID_B],
    ]);
  });
});
