import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';

import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

export default class OrbitDBCallDocumentReplicator {
  private readonly pendingDocuments = new Map<string, OrbitDBCallDocument>();

  private readonly replications = new Map<string, Promise<void>>();

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

  private async replicateLatestDocument(callId: string): Promise<void> {
    while (this.pendingDocuments.has(callId)) {
      const document = this.pendingDocuments.get(callId);

      this.pendingDocuments.delete(callId);

      if (!document) {
        continue;
      }

      try {
        await this.registry.putDocument('calls', document, [
          document.networkId,
        ]);
      } catch {
        Kernel.logger.warn?.('Call document replication failed');
      }
    }

    this.replications.delete(callId);
  }

  public replicate(document: OrbitDBCallDocument): Promise<void> {
    this.pendingDocuments.set(document.id, document);
    const replication = this.replications.get(document.id);

    if (replication) {
      return replication;
    }

    const started = this.replicateLatestDocument(document.id);
    this.replications.set(document.id, started);

    return started;
  }
}
