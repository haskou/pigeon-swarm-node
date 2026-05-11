import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPublicImageBody } from '../bodies/PostPublicImageBody';
import { PublicImageTooLargeError } from '../errors/PublicImageTooLargeError';

interface PublicImageDocument {
  contentType: string;
  data: string;
  filename?: string;
  size: number;
  uploadedAt: number;
  uploadedByIdentityId: string;
}

@JsonController('/ipfs')
export class PostPublicImageRoute extends Route {
  private static readonly MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

  private readonly ipfs: IPFS = this.get<IPFS>(IPFS);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Post('/public-images')
  public async request(
    @Body({ options: { limit: '3mb' } }) body: PostPublicImageBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const size = Buffer.byteLength(body.data, 'base64');

    if (size > PostPublicImageRoute.MAX_IMAGE_SIZE_BYTES) {
      throw new PublicImageTooLargeError(
        PostPublicImageRoute.MAX_IMAGE_SIZE_BYTES,
      );
    }

    const document: PublicImageDocument = {
      contentType: body.contentType,
      data: body.data,
      filename: body.filename,
      size,
      uploadedAt: Date.now(),
      uploadedByIdentityId: authenticatedIdentityId.valueOf(),
    };
    const cid = await this.ipfs.addJSONToAll(document);

    return response.status(HttpRouteStatusEnum.CREATED).json({
      cid: cid.valueOf(),
      contentType: body.contentType,
      size,
    });
  }
}
