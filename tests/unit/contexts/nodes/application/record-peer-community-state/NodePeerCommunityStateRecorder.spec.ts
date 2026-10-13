import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { NodePeerCommunityStateRecordMessage } from '@app/contexts/nodes/application/record-peer-community-state/messages/NodePeerCommunityStateRecordMessage';
import NodePeerCommunityStateRecorder from '@app/contexts/nodes/application/record-peer-community-state/NodePeerCommunityStateRecorder';
import { InvalidNodeCommunityStateAnnouncementError } from '@app/contexts/nodes/domain/errors/InvalidNodeCommunityStateAnnouncementError';
import { InvalidNodeCommunityStateDigestError } from '@app/contexts/nodes/domain/errors/InvalidNodeCommunityStateDigestError';
import { NodeCommunityStateDigest } from '@app/contexts/nodes/domain/value-objects/NodeCommunityStateDigest';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodePeerCommunityStateRecorder', () => {
  const digest = 'Ab-_'.repeat(10).concat('xyz');
  const networkId = '550e8400-e29b-41d4-a716-446655440000';
  let monitor: MockProxy<NodeNetworkSynchronizationMonitor>;
  let recorder: NodePeerCommunityStateRecorder;

  beforeEach(() => {
    monitor = mock<NodeNetworkSynchronizationMonitor>();
    recorder = new NodePeerCommunityStateRecorder(monitor);
  });

  it('records the community state a peer announced for a network', () => {
    recorder.record(
      new NodePeerCommunityStateRecordMessage(networkId, 'peer-1', digest),
    );

    expect(monitor.recordPeerCommunityState).toHaveBeenCalledWith(
      networkId,
      'peer-1',
      new NodeCommunityStateDigest(digest),
    );
  });

  it.each([
    ['too short', 'A'.repeat(42)],
    ['too long', 'A'.repeat(44)],
    ['not base64url', `${'A'.repeat(42)}=`],
  ])('rejects a digest that is %s', (_label, invalidDigest) => {
    expect(
      () =>
        new NodePeerCommunityStateRecordMessage(
          networkId,
          'peer-1',
          invalidDigest,
        ),
    ).toThrow(InvalidNodeCommunityStateDigestError);
  });

  it.each([
    ['an empty peer id', ''],
    ['an oversized peer id', 'p'.repeat(129)],
  ])('rejects an announcement with %s', (_label, peerId) => {
    expect(
      () => new NodePeerCommunityStateRecordMessage(networkId, peerId, digest),
    ).toThrow(InvalidNodeCommunityStateAnnouncementError);
  });

  it('rejects an announcement for a malformed network id', () => {
    expect(
      () =>
        new NodePeerCommunityStateRecordMessage('network', 'peer-1', digest),
    ).toThrow();
  });
});
