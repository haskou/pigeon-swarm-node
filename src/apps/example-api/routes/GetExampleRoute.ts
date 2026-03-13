import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

@JsonController()
export class GetExampleRoute extends Route {
  // This is how you can inject applications!
  // private readonly applicationViewModel: ApplicationViewModel =
  //   this.get<ApplicationViewModel>(ApplicationViewModel);

  @Get('/hewo')
  // eslint-disable-next-line @typescript-eslint/require-await
  public async getExample(@Res() response: Response): Promise<Response> {
    return response.status(HttpRouteStatusEnum.OK).send('Hello World');
  }
}
