import LegacyPrivateUploadRepository, {
  LegacyPrivateUpload,
} from '@app/contexts/content-replication/domain/repositories/LegacyPrivateUploadRepository';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import ContentReplicationMutationPolicy from './policies/ContentReplicationMutationPolicy';

/**
 * Finds legacy `ipfs_private_upload` registrations whose owner proof verifies.
 * Forged or unsigned records never qualify, so nobody can make this node stop
 * providing content through them.
 */
export default class OrbitDBLegacyPrivateUploadRepository extends LegacyPrivateUploadRepository {
  private static isLegacyPrivateUpload(
    document: Record<string, unknown>,
  ): boolean {
    return (
      document.removed !== true &&
      document.scopeType === 'content_replication' &&
      document.context === 'ipfs_private_upload'
    );
  }

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly policy: ContentReplicationMutationPolicy,
  ) {
    super();
  }

  private async genuineUploadOf(
    document: Record<string, unknown>,
  ): Promise<LegacyPrivateUpload | undefined> {
    try {
      if (!(await this.policy.isGenuine(document))) {
        return undefined;
      }

      return {
        cid: new ContentId(String(document.cid)),
        networkId: new NetworkId(String(document.networkId)),
      };
    } catch {
      return undefined;
    }
  }

  public async findGenuine(): Promise<LegacyPrivateUpload[]> {
    const documents = await this.registry.queryUnadmittedDocuments(
      'contentReplication',
      OrbitDBLegacyPrivateUploadRepository.isLegacyPrivateUpload,
    );
    const uploads = new Map<string, LegacyPrivateUpload>();

    for (const document of documents) {
      const upload = await this.genuineUploadOf(document);

      if (upload) {
        uploads.set(
          JSON.stringify([upload.networkId.valueOf(), upload.cid.valueOf()]),
          upload,
        );
      }
    }

    return [...uploads.values()];
  }
}
