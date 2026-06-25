import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NotificationScopeSettingsUpdater from '@app/contexts/notification-settings/application/update/NotificationScopeSettingsUpdater';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNotificationScopeSettingsBody } from '../bodies/PutNotificationScopeSettingsBody';
import { PutNotificationScopeSettingsRequest } from '../requests/PutNotificationScopeSettingsRequest';
import { NotificationScopeSettingsViewModel } from '../view-model/NotificationScopeSettingsViewModel';

@JsonController('/notification-settings')
export class PutNotificationScopeSettingsRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly updater = this.get<NotificationScopeSettingsUpdater>(
    NotificationScopeSettingsUpdater,
  );

  @Put('/scopes')
  public async putScopeSettings(
    @Body() body: PutNotificationScopeSettingsBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const settings = await this.updater.update(
      new PutNotificationScopeSettingsRequest(
        identityId.valueOf(),
        body,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NotificationScopeSettingsViewModel(settings).toResource());
  }
}
