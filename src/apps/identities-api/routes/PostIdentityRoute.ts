import { Body, JsonController, Post, Res } from 'routing-controllers';
import { Response } from 'express';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import IdentityCreator from '@app/contexts/identities/application/creator/IdentityCreator';
import { PostIdentityBody } from '../bodies/PostIdentityBody';
import { PostIdentityRequest } from '../requests/PostIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';

// TODO: Test
@JsonController('/identities')
export class PostIdentityRoute extends Route {
  private readonly identityCreator: IdentityCreator =
    this.get<IdentityCreator>(IdentityCreator);

  @Post('/')
  // eslint-disable-next-line @typescript-eslint/require-await
  public async createIdentity(
    @Body() body: PostIdentityBody,
    @Res() response: Response,
  ): Promise<Response> {
    const request = new PostIdentityRequest(body);

    const identity = await this.identityCreator.create(
      request.getIdentityCreateMessage(),
    );

    const viewModel = new IdentityViewModel(identity);

    return response.status(HttpRouteStatusEnum.OK).send(viewModel.toResource());
  }
}
