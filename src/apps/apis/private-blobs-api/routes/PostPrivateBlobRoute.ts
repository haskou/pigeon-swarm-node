import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import PrivateBlobReserver from '@app/contexts/private-blobs/application/PrivateBlobReserver';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPrivateBlobBody } from '../bodies/PostPrivateBlobBody';
import { PrivateBlobRouteSupport } from './PrivateBlobRouteSupport';

@JsonController('/private-blobs')
export class PostPrivateBlobRoute extends PrivateBlobRouteSupport {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly reserver =
    this.get<PrivateBlobReserver>(PrivateBlobReserver);

  @Post('/')
  public async request(
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PostPrivateBlobBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = this.authenticator.authenticate(request);

    try {
      const reservation = await this.reserver.reserve(
        identityId.valueOf(),
        body.size,
      );

      return response.status(HttpRouteStatusEnum.CREATED).json(reservation);
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
