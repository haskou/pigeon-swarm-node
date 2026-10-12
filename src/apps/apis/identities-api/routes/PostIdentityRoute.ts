import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostIdentityBody } from '../bodies/PostIdentityBody';
import IdentityAdmissionSourceRateLimiter from '../IdentityAdmissionSourceRateLimiter';
import IdentityNetworkAdmissionRateLimiter from '../IdentityNetworkAdmissionRateLimiter';
import IdentityPublishRateLimiter from '../IdentityPublishRateLimiter';
import { PostIdentityRequest } from '../requests/PostIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';

@JsonController('/identities')
export class PostIdentityRoute extends Route {
  private readonly identityPublisher: IdentityPublisher =
    this.get<IdentityPublisher>(IdentityPublisher);

  private readonly sourceRateLimiter =
    this.get<IdentityAdmissionSourceRateLimiter>(
      IdentityAdmissionSourceRateLimiter,
    );

  private readonly rateLimiter = this.get<IdentityPublishRateLimiter>(
    IdentityPublishRateLimiter,
  );

  private readonly networkAdmissionRateLimiter =
    this.get<IdentityNetworkAdmissionRateLimiter>(
      IdentityNetworkAdmissionRateLimiter,
    );

  @Post('/')
  public async createIdentity(
    @Body({
      options: { limit: '10mb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PostIdentityBody,
    @Req() httpRequest: Request,
    @Res() response: Response,
  ): Promise<Response> {
    this.sourceRateLimiter.consume(httpRequest.ip ?? 'unknown');
    await this.rateLimiter.consume(new IdentityId(body.id));
    await this.networkAdmissionRateLimiter.consume(body.networks);

    const request = new PostIdentityRequest(body);
    const candidate = await this.identityPublisher.publish(
      request.getIdentityPublishMessage(),
    );

    const viewModel = new IdentityViewModel(
      candidate.getIdentity(),
      candidate.getExternalIdentifier(),
    );

    return response.status(HttpRouteStatusEnum.OK).send(viewModel.toResource());
  }
}
