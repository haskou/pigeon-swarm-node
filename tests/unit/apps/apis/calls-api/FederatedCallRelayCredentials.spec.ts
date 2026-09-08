import type { Connection, Stream } from '@libp2p/interface';
import { CallRelayCredentialIssuer } from '@app/apps/apis/calls-api/CallRelayCredentialIssuer';
import { CallRelayRecordPrimitives } from '@app/apps/apis/calls-api/CallRelayRecordPrimitives';
import { mock } from 'jest-mock-extended';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import CallRelayRecordRegistry from '@app/apps/apis/calls-api/CallRelayRecordRegistry';
import FederatedCallRelayCredentials from '@app/apps/apis/calls-api/FederatedCallRelayCredentials';

describe('FederatedCallRelayCredentials', () => {
  it('never registers a credential issuer on a public network', async () => {
    const network = mock<IPFSNetwork>();
    network.isPrivate.mockReturnValue(false);
    const service = new FederatedCallRelayCredentials(
      mock<IPFSNetworkRegistry>(),
      mock<CallRelayRecordRegistry>(),
    );
    await service.start(network);
    expect(network.getHeliaCore).not.toHaveBeenCalled();
  });
  it('does not request credentials from disconnected or public peers', async () => {
    const registry = mock<IPFSNetworkRegistry>();
    const network = mock<IPFSNetwork>();
    network.isPrivate.mockReturnValue(false);
    registry.getAll.mockReturnValue([network]);
    const records = mock<CallRelayRecordRegistry>();
    records.all.mockReturnValue([]);
    await expect(
      new FederatedCallRelayCredentials(registry, records).get(),
    ).resolves.toEqual([]);
    expect(network.getHeliaCore).not.toHaveBeenCalled();
  });
});

function connectedFixture() {
  const connection = mock<Connection>();
  Object.assign(connection, {
    remotePeer: { toString: () => 'relay' },
    encryption: '/noise',
    status: 'open',
  });
  const network = mock<IPFSNetwork>();
  network.isPrivate.mockReturnValue(true);
  network.getConnectedRelayPeerIds.mockReturnValue(['relay']);
  network.getHeliaCore.mockReturnValue({
    libp2p: { getConnections: () => [connection] },
  } as unknown as ReturnType<IPFSNetwork['getHeliaCore']>);
  const registry = mock<IPFSNetworkRegistry>();
  registry.getAll.mockReturnValue([network]);
  const records = mock<CallRelayRecordRegistry>();
  const urls = ['turn:relay.test:3478'];
  records.all.mockReturnValue([
    { version: 2, peerId: 'relay', urls } as CallRelayRecordPrimitives,
  ]);
  const issuer = new CallRelayCredentialIssuer();
  connection.newStream.mockImplementation(async () => {
    const credential = issuer.issue('requester', urls, 'private-owner-secret');
    return Object.assign(mock<Stream>(), {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify(credential));
      },
    });
  });
  return {
    connection,
    network,
    records,
    registry,
    service: new FederatedCallRelayCredentials(registry, records),
  };
}

describe('federated credential reuse', () => {
  afterEach(() => jest.restoreAllMocks());
  it('keeps TURN available across eleven sequential requests without exhausting issuance', async () => {
    const { service, connection } = connectedFixture();
    for (let i = 0; i < 11; i++) expect(await service.get()).toHaveLength(1);
    expect(connection.newStream).toHaveBeenCalledTimes(1);
  });
  it('stops returning cached credentials when the private relay is no longer eligible', async () => {
    const { service, network } = connectedFixture();
    expect(await service.get()).toHaveLength(1);
    network.getConnectedRelayPeerIds.mockReturnValue([]);
    expect(await service.get()).toEqual([]);
  });
  it('renews credentials before expiry', async () => {
    const { service, connection } = connectedFixture();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    expect(await service.get()).toHaveLength(1);
    jest.spyOn(Date, 'now').mockReturnValue(now + 571_000);
    expect(await service.get()).toHaveLength(1);
    expect(connection.newStream).toHaveBeenCalledTimes(2);
  });
  it('invalidates cached credentials when the signed URL changes', async () => {
    const { service, records } = connectedFixture();
    expect(await service.get()).toHaveLength(1);
    records.all.mockReturnValue([
      {
        version: 2,
        peerId: 'relay',
        urls: ['turn:changed.test:3478'],
      } as CallRelayRecordPrimitives,
    ]);
    expect(await service.get()).toEqual([]);
  });
});

describe('federated response validation', () => {
  it.each([
    'foreign-url',
    'oversized',
    'expired',
    'overlong-lifetime',
    'extra-field',
    'malformed',
  ])('rejects %s credentials', async (kind) => {
    const { service, connection } = connectedFixture();
    const response: Record<string, unknown> = {
      ...new CallRelayCredentialIssuer().issue(
        'peer',
        ['turn:relay.test:3478'],
        'owner-secret',
      ),
    };
    if (kind === 'foreign-url') response.urls = ['turn:attacker.test:3478'];
    if (kind === 'expired') response.username = `1:${'a'.repeat(32)}`;
    if (kind === 'overlong-lifetime')
      response.username = `${Math.floor(Date.now() / 1000) + 1000}:${'a'.repeat(32)}`;
    if (kind === 'extra-field') response.secret = 'must-not-be-returned';
    connection.newStream.mockImplementation(async () =>
      Object.assign(mock<Stream>(), {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(
            kind === 'oversized'
              ? 'a'.repeat(8193)
              : kind === 'malformed'
                ? '{'
                : JSON.stringify(response),
          );
        },
      }),
    );
    expect(await service.get()).toEqual([]);
  });
  it('coalesces overlapping requests', async () => {
    const { service, connection } = connectedFixture();
    const responses = await Promise.all(
      Array.from({ length: 11 }, () => service.get()),
    );
    expect(responses.every((response) => response.length === 1)).toBe(true);
    expect(connection.newStream).toHaveBeenCalledTimes(1);
  });
  it('does not request credentials on an unencrypted connection', async () => {
    const { service, connection } = connectedFixture();
    Object.assign(connection, { encryption: undefined });
    expect(await service.get()).toEqual([]);
    expect(connection.newStream).not.toHaveBeenCalled();
  });
});


describe('owner secret rotation', () => {
  it('refreshes cached credentials after a newer advertisement with unchanged URLs', async () => {
    const { service, records, connection } = connectedFixture();
    expect(await service.get()).toHaveLength(1);
    records.all.mockReturnValue([{ version: 2, peerId: 'relay', issuedAt: Date.now(), urls: ['turn:relay.test:3478'] } as CallRelayRecordPrimitives]);
    expect(await service.get()).toHaveLength(1);
    expect(connection.newStream).toHaveBeenCalledTimes(2);
  });
});
