import DeviceAuthorizationTransitionApplier from '@app/contexts/identity-devices/application/apply-transition/DeviceAuthorizationTransitionApplier';
import { ApplyDeviceAuthorizationTransitionMessage } from '@app/contexts/identity-devices/application/apply-transition/messages/ApplyDeviceAuthorizationTransitionMessage';
import DeviceAuthorizationFinder from '@app/contexts/identity-devices/application/find/DeviceAuthorizationFinder';
import { DeviceAuthorizationFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceAuthorizationFindMessage';
import DeviceSealedSecretHandover from '@app/contexts/identity-devices/application/hand-over/DeviceSealedSecretHandover';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Body, JsonController, Post, Res } from 'routing-controllers';

import { PostDeviceAuthorizationTransitionBody } from '../bodies/PostDeviceAuthorizationTransitionBody';
import DeviceAuthorizationTransitionRateLimiter from '../DeviceAuthorizationTransitionRateLimiter';
import { InvalidDeviceSealedSecretBundleRequestError } from '../errors/InvalidDeviceSealedSecretBundleRequestError';
import { PostDeviceAuthorizationTransitionRequest } from '../requests/PostDeviceAuthorizationTransitionRequest';
import { DeviceAuthorizationTransitionResource } from '../resources/DeviceAuthorizationTransitionResource';
import { DeviceSealedSecretHandoverResource } from '../resources/DeviceSealedSecretHandoverResource';
import { DeviceAuthorizationViewModel } from '../view-model/DeviceAuthorizationViewModel';

@JsonController('/identity-devices')
export class PostDeviceAuthorizationTransitionRoute extends Route {
  private readonly applier = this.get<DeviceAuthorizationTransitionApplier>(
    DeviceAuthorizationTransitionApplier,
  );

  private readonly handover = this.get<DeviceSealedSecretHandover>(
    DeviceSealedSecretHandover,
  );

  private readonly rateLimiter =
    this.get<DeviceAuthorizationTransitionRateLimiter>(
      DeviceAuthorizationTransitionRateLimiter,
    );

  private readonly finder = this.get<DeviceAuthorizationFinder>(
    DeviceAuthorizationFinder,
  );

  private async applyTransition(
    request: PostDeviceAuthorizationTransitionRequest,
    message: ApplyDeviceAuthorizationTransitionMessage,
  ): Promise<{
    authorization: DeviceAuthorization;
    sealedSecrets?: DeviceSealedSecretHandoverResource;
  }> {
    try {
      const handover = request.getHandoverMessage();

      if (handover === undefined) {
        return { authorization: await this.applier.apply(message) };
      }

      const { authorization, handedOver } =
        await this.handover.handOver(handover);

      return {
        authorization,
        sealedSecrets: handedOver
          ? {
              authorizationRevision: handover.bundle.authorizationRevision,
              generation: handover.bundle.generation,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof InvalidDeviceSealedSecretBundleError) {
        throw new InvalidDeviceSealedSecretBundleRequestError();
      }

      throw error;
    }
  }

  @Post('/transitions')
  public async apply(
    @Body({
      options: { limit: '1mb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PostDeviceAuthorizationTransitionBody,
    @Res() response: Response,
  ): Promise<Response> {
    const request = new PostDeviceAuthorizationTransitionRequest(body);
    const message = request.getMessage();

    this.rateLimiter.consume(message.transition.getIdentityId());
    const { authorization, sealedSecrets } = await this.applyTransition(
      request,
      message,
    );
    const compromisedSince = await this.finder.findCompromisedSince(
      new DeviceAuthorizationFindMessage(authorization.getIdentityId()),
    );
    const resource: DeviceAuthorizationTransitionResource = {
      ...new DeviceAuthorizationViewModel(
        authorization,
        compromisedSince,
      ).toResource(),
      sealedSecrets,
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
