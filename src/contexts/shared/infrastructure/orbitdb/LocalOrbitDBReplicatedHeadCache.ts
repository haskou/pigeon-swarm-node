import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import OrbitDBReplicatedHeadCache, {
  OrbitDBReplicatedHeadCacheEntry,
} from './OrbitDBReplicatedHeadCache';

type LocalOrbitDBReplicatedHeadCacheDocument = {
  _id?: string;
  cachedAt: number;
  key: string;
  networkId: string;
  value: Record<string, unknown>;
};

export default class LocalOrbitDBReplicatedHeadCache extends OrbitDBReplicatedHeadCache {
  private static readonly NAMESPACE = 'orbitdb_replicated_heads';
  private static readonly WARM_NETWORK_NAMESPACE =
    'orbitdb_replicated_head_cache_warm_networks';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private documentId(networkId: string, key: string): string {
    return `${networkId}:${key}`;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalOrbitDBReplicatedHeadCacheDocument {
    return (
      typeof document.key === 'string' &&
      typeof document.networkId === 'string' &&
      typeof document.cachedAt === 'number' &&
      typeof document.value === 'object' &&
      document.value !== null &&
      !Array.isArray(document.value)
    );
  }

  public async findByNetworkId(
    networkId: string,
  ): Promise<OrbitDBReplicatedHeadCacheEntry[]> {
    const documents = await this.database.find(
      LocalOrbitDBReplicatedHeadCache.NAMESPACE,
      (document) => document.networkId === networkId,
    );

    return documents.filter(this.isDocument).map((document) => ({
      key: document.key,
      value: document.value,
    }));
  }

  public async isWarm(networkId: string): Promise<boolean> {
    const document = await this.database.findOne(
      LocalOrbitDBReplicatedHeadCache.WARM_NETWORK_NAMESPACE,
      networkId,
    );

    return (
      document !== undefined &&
      typeof document.networkId === 'string' &&
      document.networkId === networkId &&
      typeof document.warmedAt === 'number'
    );
  }

  public async findReconciledHeadSignature(
    networkId: string,
  ): Promise<string | undefined> {
    const document = await this.database.findOne(
      LocalOrbitDBReplicatedHeadCache.WARM_NETWORK_NAMESPACE,
      networkId,
    );

    const signature = document?.reconciledHeadSignature;

    return typeof signature === 'string' ? signature : undefined;
  }

  public async markWarm(
    networkId: string,
    reconciledHeadSignature?: string,
  ): Promise<void> {
    await this.database.save(
      LocalOrbitDBReplicatedHeadCache.WARM_NETWORK_NAMESPACE,
      networkId,
      {
        networkId,
        reconciledHeadSignature,
        warmedAt: Date.now(),
      },
    );
  }

  public async save(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    await this.database.save(
      LocalOrbitDBReplicatedHeadCache.NAMESPACE,
      this.documentId(networkId, key),
      {
        cachedAt: Date.now(),
        key,
        networkId,
        value,
      },
    );
  }
}
