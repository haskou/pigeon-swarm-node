import NodePeersFinder from '@app/contexts/nodes/application/find-peers/NodePeersFinder';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { mock } from 'jest-mock-extended';

describe('NodePeersFinder', () => {
  it('finds active node peers', async () => {
    const peerRepository = mock<NodePeerRepository>();
    const nodeRepository = mock<NodeRepository>();
    const localNode = mock<Node>();
    const peer = mock<NodePeer>();

    jest.spyOn(Date, 'now').mockReturnValue(1780000000000);
    nodeRepository.loadLocalNode.mockResolvedValue(localNode);
    peerRepository.findActive.mockResolvedValue([peer]);
    const activePeers = await new NodePeersFinder(
      peerRepository,
      nodeRepository,
    ).find();

    expect(peerRepository.findActive).toHaveBeenCalledWith(
      new Date(1779999100000),
    );
    expect(activePeers.getLocalNode()).toBe(localNode);
    expect(activePeers.getPeers()).toEqual([peer]);
  });
});
