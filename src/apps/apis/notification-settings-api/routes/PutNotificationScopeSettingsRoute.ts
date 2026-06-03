import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { NotificationSettingsServicesFactory } from '@app/contexts/notification-settings/application/NotificationSettingsServicesFactory';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNotificationScopeSettingsBody } from '../bodies/PutNotificationScopeSettingsBody';
import { PutNotificationScopeSettingsRequest } from '../requests/PutNotificationScopeSettingsRequest';
import { NotificationScopeSettingsViewModel } from '../view-model/NotificationScopeSettingsViewModel';

@JsonController('/notification-settings')
export class PutNotificationScopeSettingsRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private settingsServices(): NotificationSettingsServicesFactory {
    return new NotificationSettingsServicesFactory(
      this.get<MongoDB>(MongoDB),
      this.get<MessageBus>(MessageBus),
    );
  }

  @Put('/scopes')
  public async putScopeSettings(
    @Body() body: PutNotificationScopeSettingsBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const settings = await this.settingsServices()
      .updater()
      .update(
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
