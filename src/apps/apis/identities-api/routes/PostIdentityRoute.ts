import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Body, JsonController, Post, Res } from 'routing-controllers';

import { PostIdentityBody } from '../bodies/PostIdentityBody';
import IdentityPublishRateLimiter from '../IdentityPublishRateLimiter';
import { PostIdentityRequest } from '../requests/PostIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';

@JsonController('/identities')
export class PostIdentityRoute extends Route {
  private readonly identityPublisher: IdentityPublisher =
    this.get<IdentityPublisher>(IdentityPublisher);

  private readonly rateLimiter = this.get<IdentityPublishRateLimiter>(
    IdentityPublishRateLimiter,
  );

  @Post('/')
  public async createIdentity(
    @Body({
      options: { limit: '10mb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PostIdentityBody,
    @Res() response: Response,
  ): Promise<Response> {
    await this.rateLimiter.consume(new IdentityId(body.id));

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
