import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Body, JsonController, Post, Res } from 'routing-controllers';

import { PostIdentityBody } from '../bodies/PostIdentityBody';
import { PostIdentityRequest } from '../requests/PostIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';

@JsonController('/identities')
export class PostIdentityRoute extends Route {
  private readonly identityPublisher: IdentityPublisher =
    this.get<IdentityPublisher>(IdentityPublisher);

  private readonly identityFinder: IdentityFinder =
    this.get<IdentityFinder>(IdentityFinder);

  @Post('/')
  public async createIdentity(
    @Body({ options: { limit: '10mb' } }) body: PostIdentityBody,
    @Res() response: Response,
  ): Promise<Response> {
    const request = new PostIdentityRequest(body);
    const identity = await this.identityPublisher.publish(
      request.getIdentityPublishMessage(),
    );
    const candidate = await this.identityFinder.findCandidate(
      new IdentityFinderMessage(identity.toPrimitives().id),
    );

    const viewModel = new IdentityViewModel(
      candidate.getIdentity(),
      candidate.getExternalIdentifier(),
    );

    return response.status(HttpRouteStatusEnum.OK).send(viewModel.toResource());
  }
}
