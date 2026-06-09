import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFSReplicationStatusFinder from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';
import IPFSReplicationStatusSummaryRefresher from '@app/contexts/ipfs-replication/application/refresh-status-summary/IPFSReplicationStatusSummaryRefresher';
import IPFSContentReplicationRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationRegistrar';
import IPFSReplicationStatusSummaryUpdater from '@app/contexts/ipfs-replication/application/update-status-summary/IPFSReplicationStatusSummaryUpdater';
import MongoIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicaClaimRepository';
import MongoIPFSReplicationStatusSummaryRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSReplicationStatusSummaryRepository';
import OrbitDBIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/orbitdb/OrbitDBIPFSContentReplicationRepository';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
import MongoNodePeerRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodePeerRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

import IPFSContentPublisher from '../services/IPFSContentPublisher';

export abstract class IPFSContentUploadRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private replicationRegistrar(): IPFSContentReplicationRegistrar {
    const mongo = this.get<MongoDB>(MongoDB);
    const contentRepository = new OrbitDBIPFSContentReplicationRepository();
    const claimRepository = new MongoIPFSContentReplicaClaimRepository(mongo);

    return new IPFSContentReplicationRegistrar(
      contentRepository,
      claimRepository,
      this.get<MessageBus>(MessageBus) as DomainEventPublisher,
      new IPFSReplicationStatusSummaryRefresher(
        new IPFSReplicationStatusFinder(
          contentRepository,
          claimRepository,
          this.get<MongoNodeMetadataRepository>(MongoNodeMetadataRepository),
          new MongoNodePeerRepository(mongo),
        ),
        new IPFSReplicationStatusSummaryUpdater(
          new MongoIPFSReplicationStatusSummaryRepository(mongo),
        ),
      ),
    );
  }

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected bodyFrom(request: Request): Buffer {
    return Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
  }

  protected publisher(): IPFSContentPublisher {
    return new IPFSContentPublisher(
      this.get<IPFS>(IPFS),
      this.get<MongoNodeMetadataRepository>(MongoNodeMetadataRepository),
      this.replicationRegistrar(),
    );
  }
}
