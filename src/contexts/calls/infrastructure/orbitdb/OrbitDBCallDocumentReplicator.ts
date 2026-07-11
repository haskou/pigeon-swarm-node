import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';

import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

export default class OrbitDBCallDocumentReplicator {
  private readonly pendingDocuments = new Map<string, OrbitDBCallDocument>();

  private readonly replicatingCallIds = new Set<string>();

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
      } catch (error) {
        Kernel.logger.warn?.(
          `Call document replication failed: callId=${document.id} error=${String(error)}`,
        );
      }
    }

    this.replicatingCallIds.delete(callId);
  }

  public replicate(document: OrbitDBCallDocument): void {
    this.pendingDocuments.set(document.id, document);

    if (this.replicatingCallIds.has(document.id)) {
      return;
    }

    this.replicatingCallIds.add(document.id);
    void this.replicateLatestDocument(document.id);
  }
}
