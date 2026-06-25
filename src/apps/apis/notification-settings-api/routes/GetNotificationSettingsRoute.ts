import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NotificationSettingsFinder from '@app/contexts/notification-settings/application/find/NotificationSettingsFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { GetNotificationSettingsRequest } from '../requests/GetNotificationSettingsRequest';
import { NotificationSettingsViewModel } from '../view-model/NotificationSettingsViewModel';

@JsonController('/notification-settings')
export class GetNotificationSettingsRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly finder = this.get<NotificationSettingsFinder>(
    NotificationSettingsFinder,
  );

  @Get('/')
  public async getSettings(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const settings = await this.finder.find(
      new GetNotificationSettingsRequest(identityId.valueOf()).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NotificationSettingsViewModel(settings).toResource());
  }
}
