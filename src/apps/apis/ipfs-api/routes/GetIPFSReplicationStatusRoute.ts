import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFSReplicationStatusFinder from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';
import MongoIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicaClaimRepository';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
import MongoNodePeerRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodePeerRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { IPFSReplicationStatusViewModel } from '../view-model/IPFSReplicationStatusViewModel';

@JsonController('/ipfs')
export class GetIPFSReplicationStatusRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private finder(): IPFSReplicationStatusFinder {
    const mongo = this.get<MongoDB>(MongoDB);

    return new IPFSReplicationStatusFinder(
      new MongoIPFSContentReplicationRepository(mongo),
      new MongoIPFSContentReplicaClaimRepository(mongo),
      this.get<MongoNodeMetadataRepository>(MongoNodeMetadataRepository),
      new MongoNodePeerRepository(mongo),
    );
  }

  @Get('/replication/status')
  public async request(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.signedRequestAuthenticator.authenticate(request);
    const status = await this.finder().find();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new IPFSReplicationStatusViewModel(status).toResource());
  }
}
