import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { NotificationSettingsServicesFactory } from '@app/contexts/notification-settings/application/NotificationSettingsServicesFactory';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, Delete, JsonController, Req, Res } from 'routing-controllers';

import { DeleteNotificationScopeSettingsBody } from '../bodies/DeleteNotificationScopeSettingsBody';
import { DeleteNotificationScopeSettingsRequest } from '../requests/DeleteNotificationScopeSettingsRequest';

@JsonController('/notification-settings')
export class DeleteNotificationScopeSettingsRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private settingsServices(): NotificationSettingsServicesFactory {
    return new NotificationSettingsServicesFactory(
      this.get<MongoDB>(MongoDB),
      this.get<MessageBus>(MessageBus),
    );
  }

  @Delete('/scopes')
  public async deleteScopeSettings(
    @Body() body: DeleteNotificationScopeSettingsBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    await this.settingsServices()
      .resetter()
      .reset(
        new DeleteNotificationScopeSettingsRequest(
          identityId.valueOf(),
          body,
        ).getMessage(),
      );

    return response.status(HttpRouteStatusEnum.OK).send();
  }
}
