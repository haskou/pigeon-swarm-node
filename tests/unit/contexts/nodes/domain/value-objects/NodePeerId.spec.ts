import { InvalidNodePeerIdError } from '@app/contexts/nodes/domain/errors/InvalidNodePeerIdError';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';

import { NODE_PEER_ID_A } from '../../../../mothers/NodeBlockListMother';

describe('NodePeerId', () => {
  it('should accept a base58btc libp2p peer id', () => {
    expect(new NodePeerId(NODE_PEER_ID_A).valueOf()).toBe(NODE_PEER_ID_A);
  });

  it.each([
    ['too short', '12D3KooW'],
    ['not base58', `${NODE_PEER_ID_A.slice(0, -1)}0`],
    ['empty', ''],
  ])('should reject a peer id that is %s', (_case, value) => {
    expect(() => new NodePeerId(value)).toThrow(InvalidNodePeerIdError);
  });
});
