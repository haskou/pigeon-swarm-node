import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBReplicatedDocumentStoreName } from './OrbitDBReplicatedDocumentStoreName';
import { OrbitDBReplicatedStateStores } from './OrbitDBReplicatedStateStores';

export class OrbitDBReplicatedStateRegistry {
  private static instance?: OrbitDBReplicatedStateRegistry;

  private readonly storesByNetworkId = new Map<
    string,
    OrbitDBReplicatedStateStores
  >();

  public static shared(): OrbitDBReplicatedStateRegistry {
    if (!this.instance) {
      this.instance = new OrbitDBReplicatedStateRegistry();
    }

    return this.instance;
  }

  private getStore(
    stores: OrbitDBReplicatedStateStores,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): OrbitDBDatabase {
    return stores[storeName];
  }

  private async allDocuments(
    store: OrbitDBDatabase,
  ): Promise<Array<Record<string, unknown>>> {
    const entries = await store.all?.();

    return (entries || [])
      .map((entry) => entry.value)
      .filter(
        (value): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
      );
  }

  public register(
    networkId: string,
    stores: OrbitDBReplicatedStateStores,
  ): void {
    this.storesByNetworkId.set(networkId, stores);
  }

  public clear(): void {
    this.storesByNetworkId.clear();
  }

  public async queryDocuments(
    storeName: OrbitDBReplicatedDocumentStoreName,
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<Array<Record<string, unknown>>> {
    const documents: Array<Record<string, unknown>> = [];

    for (const stores of this.storesByNetworkId.values()) {
      const store = this.getStore(stores, storeName);
      const matches = store.query
        ? await store.query(matcher)
        : (await this.allDocuments(store)).filter(matcher);

      documents.push(...matches);
    }

    return documents;
  }

  public async putDocument(
    storeName: OrbitDBReplicatedDocumentStoreName,
    document: Record<string, unknown>,
  ): Promise<void> {
    for (const stores of this.storesByNetworkId.values()) {
      await this.getStore(stores, storeName).put?.(document);
    }
  }
}
