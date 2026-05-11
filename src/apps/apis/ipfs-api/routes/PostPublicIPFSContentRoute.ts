import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
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

import { PublicIPFSContentTooLargeError } from '../errors/PublicIPFSContentTooLargeError';

interface PublicIPFSContentDocument {
  contentType: string;
  data: string;
  filename?: string;
  size: number;
  uploadedAt: number;
  uploadedByIdentityId: string;
}

@JsonController('/ipfs')
export class PostPublicIPFSContentRoute extends Route {
  private static readonly MAX_CONTENT_SIZE_BYTES = 10 * 1024 * 1024;

  private readonly ipfs: IPFS = this.get<IPFS>(IPFS);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Post('/public')
  @UseBefore(
    express.raw({
      limit: `${PostPublicIPFSContentRoute.MAX_CONTENT_SIZE_BYTES}b`,
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

    if (body.length > PostPublicIPFSContentRoute.MAX_CONTENT_SIZE_BYTES) {
      throw new PublicIPFSContentTooLargeError(
        PostPublicIPFSContentRoute.MAX_CONTENT_SIZE_BYTES,
      );
    }

    const document: PublicIPFSContentDocument = {
      contentType: contentType || 'application/octet-stream',
      data: body.toString('base64'),
      filename,
      size: body.length,
      uploadedAt: Date.now(),
      uploadedByIdentityId: authenticatedIdentityId.valueOf(),
    };
    const cid = await this.ipfs.addJSONToAll(document);

    return response.status(HttpRouteStatusEnum.CREATED).json({
      cid: cid.valueOf(),
      contentType: document.contentType,
      filename,
      size: body.length,
    });
  }
}
