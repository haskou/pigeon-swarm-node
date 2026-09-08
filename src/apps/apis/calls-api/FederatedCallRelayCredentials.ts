import type { Connection, Stream } from '@libp2p/interface';

import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';

import { CallRelayConfiguration } from './CallRelayConfiguration';
import CallRelayCredentialIssuer from './CallRelayCredentialIssuer';
import CallRelayRecordRegistry from './CallRelayRecordRegistry';
import { FederatedTurnCredential } from './types/FederatedTurnCredential';

export default class FederatedCallRelayCredentials {
  private static readonly protocol = '/pigeon-swarm/turn-credentials/2.0.0';
  private readonly started = new WeakSet<IPFSNetwork>();
  private readonly cached = new Map<
    string,
    { credential: FederatedTurnCredential; issuedAt: number }
  >();

  private pending?: Promise<FederatedTurnCredential[]>;

  public constructor(
    private readonly networks: IPFSNetworkRegistry,
    private readonly records: CallRelayRecordRegistry,
    private readonly issuer: CallRelayCredentialIssuer,
  ) {}

  private async serve(
    stream: Stream,
    connection: Connection,
    network: IPFSNetwork,
  ): Promise<void> {
    try {
      const configuration = CallRelayConfiguration.fromRelaySettings(
        this.networks.getRelaySettings(),
      );

      if (
        !network.isPrivate() ||
        !connection.encryption ||
        connection.status !== 'open' ||
        !this.networks.getAll().includes(network) ||
        !configuration.canPublishLocalRelay()
      ) {
        throw new Error('TURN credential request rejected');
      }
      const credential = this.issuer.issue(
        connection.remotePeer.toString(),
        configuration.getAdvertisedTurnUrls(),
        configuration.getTurnSharedSecret(),
      );
      const bytes = Buffer.from(JSON.stringify(credential));

      if (bytes.length > 8192)
        throw new Error('TURN credential request rejected');
      stream.send(bytes);
      await stream.close({ signal: AbortSignal.timeout(5000) });
    } catch {
      stream.abort(new Error('TURN credential request rejected'));
    }
  }

  private hasValidUrls(value: unknown, urls: string[]): boolean {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 8 &&
      value.every((url) => typeof url === 'string' && urls.includes(url))
    );
  }

  private hasValidCredential(candidate: Record<string, unknown>): boolean {
    return (
      typeof candidate.username === 'string' &&
      /^[0-9]{1,12}:[a-f0-9]{32}$/.test(candidate.username) &&
      typeof candidate.credential === 'string' &&
      /^[A-Za-z0-9+/]{27}=$/.test(candidate.credential)
    );
  }

  private validate(value: unknown, urls: string[]): FederatedTurnCredential {
    if (!value || typeof value !== 'object')
      throw new Error('Invalid TURN credential response');
    const candidate = value as Record<string, unknown>;

    if (
      Object.keys(candidate).sort().join(',') !== 'credential,urls,username' ||
      !this.hasValidUrls(candidate.urls, urls) ||
      !this.hasValidCredential(candidate)
    ) {
      throw new Error('Invalid TURN credential response');
    }
    const credential = candidate as FederatedTurnCredential;
    const expiry = Number(credential.username.split(':')[0]);
    const now = Math.floor(Date.now() / 1000);

    if (expiry <= now + 30 || expiry > now + 630)
      throw new Error('Invalid TURN credential response');

    return credential;
  }

  private async request(
    connection: Connection,
    urls: string[],
  ): Promise<FederatedTurnCredential> {
    const signal = AbortSignal.timeout(5000);
    const stream = await connection.newStream(
      FederatedCallRelayCredentials.protocol,
      { runOnLimitedConnection: true, signal },
    );
    stream.maxReadBufferLength = 8192;
    stream.inactivityTimeout = 5000;
    const abort = (): void =>
      stream.abort(new Error('TURN credential request timed out'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) throw new Error('TURN credential request timed out');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.byteLength;

        if (size > 8192) throw new Error('Invalid TURN credential response');
        chunks.push(Buffer.from(chunk.subarray()));
      }

      return this.validate(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
        urls,
      );
    } finally {
      signal.removeEventListener('abort', abort);
      stream.abort(new Error('TURN credential exchange finished'));
    }
  }

  private candidates(): Array<{
    connection: Connection;
    urls: string[];
    issuedAt: number;
  }> {
    const records = this.records.all().filter((record) => record.version === 2);
    const candidates = new Map<
      string,
      { connection: Connection; urls: string[]; issuedAt: number }
    >();
    for (const network of this.networks
      .getAll()
      .filter((network) => network.isPrivate())) {
      const peers = new Set(network.getConnectedRelayPeerIds());
      const connections = network
        .getHeliaCore()
        .libp2p.getConnections()
        .filter(
          (connection) =>
            connection.status === 'open' &&
            connection.encryption &&
            peers.has(connection.remotePeer.toString()),
        );
      for (const connection of connections) {
        const peer = connection.remotePeer.toString();
        const record = records.find((record) => record.peerId === peer);

        if (record)
          candidates.set(peer, {
            connection,
            issuedAt: record.issuedAt,
            urls: record.urls,
          });

        if (candidates.size === 3) return [...candidates.values()];
      }
    }

    return [...candidates.values()];
  }

  private async credentialFor(
    connection: Connection,
    urls: string[],
    issuedAt: number,
  ): Promise<FederatedTurnCredential> {
    const peer = connection.remotePeer.toString();
    const cached = this.cached.get(peer);

    if (cached && cached.issuedAt === issuedAt) {
      try {
        return this.validate(cached.credential, urls);
      } catch {
        this.cached.delete(peer);
      }
    }
    const credential = await this.request(connection, urls);
    this.cached.set(peer, { credential, issuedAt });

    return credential;
  }

  private async collect(): Promise<FederatedTurnCredential[]> {
    const candidates = this.candidates();
    const seen = new Set(
      candidates.map((candidate) => candidate.connection.remotePeer.toString()),
    );
    for (const peer of this.cached.keys()) {
      if (!seen.has(peer)) this.cached.delete(peer);
    }
    const results = await Promise.allSettled(
      candidates.map((candidate) =>
        this.credentialFor(
          candidate.connection,
          candidate.urls,
          candidate.issuedAt,
        ),
      ),
    );

    return results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
  }

  public async start(network: IPFSNetwork): Promise<void> {
    if (!network.isPrivate() || this.started.has(network)) return;
    await network
      .getHeliaCore()
      .libp2p.handle(
        FederatedCallRelayCredentials.protocol,
        (stream, connection) => this.serve(stream, connection, network),
        {
          maxInboundStreams: 2,
          maxOutboundStreams: 2,
          runOnLimitedConnection: true,
        },
      );
    this.started.add(network);
  }

  public async get(): Promise<FederatedTurnCredential[]> {
    this.pending ??= this.collect().finally(() => {
      this.pending = undefined;
    });

    return this.pending;
  }
}
