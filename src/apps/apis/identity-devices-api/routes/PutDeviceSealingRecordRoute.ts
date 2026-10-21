import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import DeviceSealingRecordPublisher from '@app/contexts/identity-devices/application/publish/DeviceSealingRecordPublisher';
import { PublishDeviceSealingRecordMessage } from '@app/contexts/identity-devices/application/publish/messages/PublishDeviceSealingRecordMessage';
import { DeviceSealingRecordRejectedError } from '@app/contexts/identity-devices/domain/errors/DeviceSealingRecordRejectedError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { assert } from '@haskou/value-objects';
import { Request, Response } from 'express';
import { Body, JsonController, Param, Put, Req, Res } from 'routing-controllers';

import { PutDeviceSealingRecordBody } from '../bodies/PutDeviceSealingRecordBody';
import { DeviceSealingRecordRejectedHttpError } from '../errors/DeviceSealingRecordRejectedHttpError';

@JsonController('/identity-devices')
export class PutDeviceSealingRecordRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly publisher = this.get<DeviceSealingRecordPublisher>(
    DeviceSealingRecordPublisher,
  );

  /** Only the identity itself publishes the sealing records of its devices. */
  @Put('/:identityId/sealing-records')
  public async publish(
    @Param('identityId') identityId: string,
    @Body({
      options: { limit: '8kb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PutDeviceSealingRecordBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requester = await this.authenticator.authenticate(request);
    const target = new IdentityId(decodeURIComponent(identityId));

    assert(target.isEqual(requester), new InvalidSignedRequestError());

    try {
      const created = await this.publisher.publish(
        new PublishDeviceSealingRecordMessage(
          target.valueOf(),
          body.deviceCredential,
          body.utcDay,
          body.sealingPublicKey,
          body.signature,
        ),
      );

      return response
        .status(created ? HttpRouteStatusEnum.CREATED : HttpRouteStatusEnum.OK)
        .send();
    } catch (error) {
      if (error instanceof DeviceSealingRecordRejectedError) {
        throw new DeviceSealingRecordRejectedHttpError();
      }

      throw error;
    }
  }
}
