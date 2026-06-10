import { maxIPFSContentSizeBytes } from '@app/contexts/ipfs-replication/application/publish-content/IPFSContentUploadLimits';
import { IPFSContentPublishMessage } from '@app/contexts/ipfs-replication/application/publish-content/messages/IPFSContentPublishMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
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

import { IPFSContentUploadRoute } from './IPFSContentUploadRoute';

@JsonController('/ipfs')
export class PostPublicIPFSContentRoute extends IPFSContentUploadRoute {
  @Post('/public')
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
    const ownerIdentityId = await this.authenticate(request);
    const published = await this.publisher().publishPublic(
      new IPFSContentPublishMessage({
        body: this.bodyFrom(request),
        contentType,
        filename,
        ownerIdentityId: ownerIdentityId.valueOf(),
      }),
    );

    return response.status(HttpRouteStatusEnum.CREATED).json(published);
  }
}
