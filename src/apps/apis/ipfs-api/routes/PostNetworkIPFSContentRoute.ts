import { maxContentSizeBytes } from '@app/contexts/content-replication/application/publish-content/ContentUploadLimits';
import { PrivateContentPublishMessage } from '@app/contexts/content-replication/application/publish-content/messages/PrivateContentPublishMessage';
import { IPFSNetworkNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSNetworkNotFoundError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import * as express from 'express';
import { Request, Response } from 'express';
import {
  HeaderParam,
  JsonController,
  NotFoundError,
  Param,
  Post,
  Req,
  Res,
  UseBefore,
} from 'routing-controllers';

import { IPFSContentUploadRouteSupport } from './IPFSContentUploadRouteSupport';

@JsonController('/ipfs')
export class PostNetworkIPFSContentRoute extends IPFSContentUploadRouteSupport {
  @Post('/:networkId([0-9a-fA-F-]{36})')
  @UseBefore(
    express.raw({
      limit: `${maxContentSizeBytes}b`,
      type: '*/*',
    }),
  )
  public async request(
    @Param('networkId') networkId: string,
    @HeaderParam('content-type') contentType: string | undefined,
    @HeaderParam('x-filename') filename: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = await this.authenticate(request);
    const message = new PrivateContentPublishMessage({
      body: this.bodyFrom(request),
      contentType,
      filename,
      networkId,
      ownerIdentityId: ownerIdentityId.valueOf(),
    });

    try {
      const published = await this.publisher().publishPrivate(message);

      return response.status(HttpRouteStatusEnum.CREATED).json(published);
    } catch (error: unknown) {
      if (error instanceof IPFSNetworkNotFoundError) {
        throw new NotFoundError(error.message);
      }

      throw error;
    }
  }
}
