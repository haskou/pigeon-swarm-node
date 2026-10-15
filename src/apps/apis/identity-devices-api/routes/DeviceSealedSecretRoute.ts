import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { signedRequestReplayGuard } from '@app/apps/apis/shared/SignedRequestReplayGuard';
import DeviceAuthorizationFinder from '@app/contexts/identity-devices/application/find/DeviceAuthorizationFinder';
import DeviceSealedSecretFinder from '@app/contexts/identity-devices/application/find/DeviceSealedSecretFinder';
import { DeviceAuthorizationFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceAuthorizationFindMessage';
import { DeviceSealedSecretFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceSealedSecretFindMessage';
import DeviceSealedSecretPublisher from '@app/contexts/identity-devices/application/publish/DeviceSealedSecretPublisher';
import { DeviceSealedSecretNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretNotFoundError';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  Get,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutDeviceSealedSecretBundleBody } from '../bodies/PutDeviceSealedSecretBundleBody';
import { DeviceAuthorizationRequestAuthenticator } from '../DeviceAuthorizationRequestAuthenticator';
import { DeviceSealedSecretDeliveryNotFoundError } from '../errors/DeviceSealedSecretDeliveryNotFoundError';
import { InvalidDeviceSealedSecretBundleRequestError } from '../errors/InvalidDeviceSealedSecretBundleRequestError';
import { PutDeviceSealedSecretBundleRequest } from '../requests/PutDeviceSealedSecretBundleRequest';

@JsonController('/identity-devices')
export class DeviceSealedSecretRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly deviceAuthenticator =
    new DeviceAuthorizationRequestAuthenticator();

  private readonly authorizationFinder = this.get<DeviceAuthorizationFinder>(
    DeviceAuthorizationFinder,
  );

  private readonly publisher = this.get<DeviceSealedSecretPublisher>(
    DeviceSealedSecretPublisher,
  );

  private readonly finder = this.get<DeviceSealedSecretFinder>(
    DeviceSealedSecretFinder,
  );

  @Put('/:identityId/sealed-secrets')
  public async publish(
    @Param('identityId') identityId: string,
    @Body({
      options: { limit: '1mb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PutDeviceSealedSecretBundleBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const target = new IdentityId(identityId);
    const authorization = await this.authorizationFinder.find(
      new DeviceAuthorizationFindMessage(target),
    );
    const publisherCredential =
      this.deviceAuthenticator.authenticateCurrentDevice(
        request,
        authorization,
      );
    await this.signedRequestAuthenticator.assertIsNotBlocked(target);
    const signature = request.header('x-device-signature');

    if (
      signature === undefined ||
      !signedRequestReplayGuard.accept(target.toString(), signature)
    ) {
      throw new InvalidSignedRequestError();
    }

    try {
      await this.publisher.publish(
        new PutDeviceSealedSecretBundleRequest(
          target,
          publisherCredential,
          body,
        ).getMessage(),
      );
    } catch (error) {
      if (error instanceof InvalidDeviceSealedSecretBundleError) {
        throw new InvalidDeviceSealedSecretBundleRequestError();
      }

      throw error;
    }

    return response.status(HttpRouteStatusEnum.OK).send({
      authorizationRevision: body.authorizationRevision,
      generation: body.generation,
      identityId: target.valueOf(),
    });
  }

  @Get('/:identityId/sealed-secrets')
  public async find(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const target = new IdentityId(identityId);
    const authorization = await this.authorizationFinder.find(
      new DeviceAuthorizationFindMessage(target),
    );
    const recipientCredential =
      this.deviceAuthenticator.authenticateCurrentDevice(
        request,
        authorization,
      );
    await this.signedRequestAuthenticator.assertIsNotBlocked(target);

    try {
      const delivery = await this.finder.find(
        new DeviceSealedSecretFindMessage(target, recipientCredential),
      );

      return response.status(HttpRouteStatusEnum.OK).send(delivery);
    } catch (error) {
      if (error instanceof DeviceSealedSecretNotFoundError) {
        throw new DeviceSealedSecretDeliveryNotFoundError();
      }

      throw error;
    }
  }
}
