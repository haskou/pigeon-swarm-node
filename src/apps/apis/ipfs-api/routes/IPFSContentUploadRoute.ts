import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFSContentReplicationRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationRegistrar';
import MongoIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicaClaimRepository';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
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

    return new IPFSContentReplicationRegistrar(
      new MongoIPFSContentReplicationRepository(mongo),
      new MongoIPFSContentReplicaClaimRepository(mongo),
      this.get<MessageBus>(MessageBus) as DomainEventPublisher,
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
