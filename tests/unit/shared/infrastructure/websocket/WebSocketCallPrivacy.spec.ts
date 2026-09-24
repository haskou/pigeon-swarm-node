import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { CallViewModel } from '@app/apps/apis/calls-api/view-model/CallViewModel';
import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallSignalAcknowledger from '@app/contexts/calls/application/acknowledge-signal/CallSignalAcknowledger';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import IdentityPresenceHeartbeatRecorder from '@app/contexts/presence/application/record-heartbeat/IdentityPresenceHeartbeatRecorder';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import WebSocketClientMessageHandler from '@app/shared/infrastructure/websocket/WebSocketClientMessageHandler';
import { WebSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { mock } from 'jest-mock-extended';
import { generateKeyPairSync } from 'node:crypto';
import { WebSocket } from 'ws';

const creator = new IdentityId(
  'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
);
const other = new IdentityId(
  'MCowBQYDK2VwAyEARcVr0970Zu0KPAIPEEvpy9RjsnM05VnDmccfWloMx8k=',
);
const network = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
const node = new NodeId('550e8400-e29b-41d4-a716-446655440002');

function startCall() {
  return Call.start(
    creator,
    network,
    CallScope.communityChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('voice-1'),
    ),
    [],
  );
}

function socket() {
  return {
    on: jest.fn(),
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('live call privacy', () => {
  it('retains the conversation ender without exposing a community session ender', () => {
    const direct = Call.start(
      creator,
      network,
      CallScope.conversation(new ConversationId('conversation-1')),
      [other],
    );
    direct.end(creator);
    const directResource = new CallViewModel(direct, [], []).toResource();
    expect(directResource.endedByIdentityId).toBe(creator.valueOf());
    expect(directResource.endedAt).toEqual(expect.any(Number));
    const communityCall = startCall();
    communityCall.end(creator);
    expect(
      new CallViewModel(communityCall, [], []).toResource(),
    ).not.toHaveProperty('endedByIdentityId');
  });

  it('exposes only current presence, without departed identities, session history or transport diagnostics', () => {
    const call = startCall();
    call.joinOrAdd(other);
    call.leave(creator);
    const lease = CallParticipantLease.connect(
      call.getId(),
      other,
      node,
      network,
      call.getParticipantIds(),
    );
    const resource = new CallViewModel(
      call,
      [lease],
      call.getParticipantIds(),
    ).toResource();
    expect(resource).toEqual({
      id: call.getId().valueOf(),
      networkId: network.valueOf(),
      scope: call.getScope().toPrimitives(),
      status: 'active',
      participantIds: [other.valueOf()],
      participants: [
        {
          identityId: other.valueOf(),
          connected: true,
          status: 'joined',
          mediaConnections: [],
        },
      ],
    });
    lease.disconnect();
    expect(
      new CallViewModel(call, [lease], call.getParticipantIds()).toResource()
        .participants,
    ).toEqual([]);
  });

  it('stops delivery on the same socket after current scope access is revoked', async () => {
    const call = startCall();
    const calls = mock<CallRepository>();
    const conversations = mock<ConversationRepository>();
    const communities = mock<CommunityRepository>();
    const community = mock<Community>();
    calls.findById.mockResolvedValue(call);
    communities.findById.mockResolvedValue(community);
    const leases = new InMemoryCallParticipantLeaseRepository();
    const lease = CallParticipantLease.connect(
      call.getId(),
      creator,
      node,
      network,
      call.getParticipantIds(),
    );
    await leases.save(lease);
    const hub = new WebSocketEventHub();
    hub.setClientMessageHandler(
      new WebSocketClientMessageHandler(
        conversations,
        communities,
        mock<IdentityPresenceHeartbeatRecorder>(),
        mock<CallSignalAcknowledger>(),
        calls,
        leases,
        new CallAccessAuthorizer(conversations, communities),
      ),
    );
    const client = socket();
    hub.register(creator, client);
    (client.send as jest.Mock).mockClear();
    const [started] = call.pullDomainEvents();
    hub.publish([started]);
    await flush();
    expect(client.send).toHaveBeenCalledTimes(1);
    const message = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    expect(message.event.attributes).toEqual({
      callId: call.getId().valueOf(),
      liveCallRevision: 1,
      liveCall: new CallViewModel(
        call,
        [lease],
        call.getParticipantIds(),
      ).toResource(),
    });
    (client.send as jest.Mock).mockClear();
    hub.publish(lease.pullDomainEvents());
    await flush();
    const leaseMessage = JSON.parse(
      (client.send as jest.Mock).mock.calls[0][0],
    );
    expect(leaseMessage.event.aggregate_id).toBe(call.getId().valueOf());
    expect(JSON.stringify(leaseMessage)).not.toContain(node.valueOf());
    (client.send as jest.Mock).mockClear();
    community.authorizeVoiceChannelCall.mockImplementation(() => {
      throw new Error('Access revoked');
    });
    hub.publish([started]);
    await flush();
    expect(client.send).not.toHaveBeenCalled();
  });

  it('delivers an expired lease snapshot to participants who joined after the lease roster was captured', async () => {
    const call = startCall();
    const lease = CallParticipantLease.connect(
      call.getId(),
      creator,
      node,
      network,
      call.getParticipantIds(),
    );
    lease.pullDomainEvents();
    call.joinOrAdd(other);
    const calls = mock<CallRepository>();
    calls.findById.mockResolvedValue(call);
    const conversations = mock<ConversationRepository>();
    const communities = mock<CommunityRepository>();
    communities.findById.mockResolvedValue(mock<Community>());
    const leases = new InMemoryCallParticipantLeaseRepository();
    await leases.save(lease);
    await leases.save(
      CallParticipantLease.connect(
        call.getId(),
        other,
        node,
        network,
        call.getParticipantIds(),
      ),
    );
    const hub = new WebSocketEventHub();
    hub.setClientMessageHandler(
      new WebSocketClientMessageHandler(
        conversations,
        communities,
        mock<IdentityPresenceHeartbeatRecorder>(),
        mock<CallSignalAcknowledger>(),
        calls,
        leases,
        new CallAccessAuthorizer(conversations, communities),
      ),
    );
    const client = socket();
    hub.register(other, client);
    const outsider = new IdentityId(
      generateKeyPairSync('ed25519')
        .publicKey.export({ type: 'spki', format: 'der' })
        .toString('base64'),
    );
    const outsiderClient = socket();
    const community = (await communities.findById(new CommunityId('community-1')))!;
    jest.mocked(community.authorizeVoiceChannelCall).mockImplementation((identityId) => {
      if (identityId.isEqual(outsider)) throw new Error('Not a member');
    });
    hub.register(outsider, outsiderClient);
    (client.send as jest.Mock).mockClear();
    (outsiderClient.send as jest.Mock).mockClear();
    lease.disconnect();
    await leases.save(lease);
    hub.publish(lease.pullDomainEvents());
    await flush();
    expect(client.send).toHaveBeenCalledTimes(1);
    const resource = JSON.parse((client.send as jest.Mock).mock.calls[0][0])
      .event.attributes.liveCall;
    expect(resource.participantIds).toEqual([other.valueOf()]);
    expect(outsiderClient.send).not.toHaveBeenCalled();
  });

  it('fails closed when the authorization handler is unavailable', async () => {
    const call = startCall();
    const hub = new WebSocketEventHub();
    const client = socket();
    hub.register(creator, client);
    (client.send as jest.Mock).mockClear();
    hub.publish(call.pullDomainEvents());
    await flush();
    expect(client.send).not.toHaveBeenCalled();
  });
});
