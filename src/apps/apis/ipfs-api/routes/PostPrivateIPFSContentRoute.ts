import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFSContentReplicationRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationRegistrar';
import { IPFSContentReplicationPriority } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationPriority';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import * as express from 'express';
import { Request, Response } from 'express';
import {
  HeaderParam,
  JsonController,
  Post,
  Req,
  Res,
  UseBefore,
} from 'routing-controllers';

import { IPFSContentTooLargeError } from '../errors/IPFSContentTooLargeError';
import { maxIPFSContentSizeBytes } from '../IPFSContentLimits';

interface PrivateIPFSContentDocument {
  contentType: string;
  encryptedData: string;
  encrypted: true;
  filename?: string;
  size: number;
  uploadedAt: number;
  uploadedByIdentityId: string;
}

@JsonController('/ipfs')
export class PostPrivateIPFSContentRoute extends Route {
  private readonly ipfs: IPFS = this.get<IPFS>(IPFS);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private replicationRegistrar(): IPFSContentReplicationRegistrar {
    return new IPFSContentReplicationRegistrar(
      new MongoIPFSContentReplicationRepository(this.get<MongoDB>(MongoDB)),
    );
  }

  @Post('/private')
  @Post('/secure')
  @UseBefore(
    express.raw({
      limit: `${maxIPFSContentSizeBytes}b`,
      type: '*/*',
    }),
  )
  public async request(
    @HeaderParam('content-type') contentType: string | undefined,
    @HeaderParam('x-filename') filename: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);

    if (body.length > maxIPFSContentSizeBytes) {
      throw new IPFSContentTooLargeError(maxIPFSContentSizeBytes);
    }

    const document: PrivateIPFSContentDocument = {
      contentType: contentType || 'application/octet-stream',
      encrypted: true,
      encryptedData: body.toString('base64'),
      filename,
      size: body.length,
      uploadedAt: Date.now(),
      uploadedByIdentityId: authenticatedIdentityId.valueOf(),
    };
    const cid = await this.ipfs.addJSONToAll(document);
    const networkIds = (await this.ipfs.getNetworks()).map((network) =>
      network.getId(),
    );

    await this.replicationRegistrar().register({
      cid: cid.valueOf(),
      context: 'ipfs_private_upload',
      networkIds,
      ownerIdentityId: authenticatedIdentityId.valueOf(),
      priority: IPFSContentReplicationPriority.NORMAL,
      sizeBytes: body.length,
    });

    return response.status(HttpRouteStatusEnum.CREATED).json({
      cid: cid.valueOf(),
      contentType: document.contentType,
      encrypted: true,
      filename,
      size: body.length,
    });
  }
}
