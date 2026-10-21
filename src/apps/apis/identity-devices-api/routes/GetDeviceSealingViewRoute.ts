import { NonCanonicalIdentityIdError } from '@app/apps/apis/shared/errors/NonCanonicalIdentityIdError';
import DeviceSealingViewFinder from '@app/contexts/identity-devices/application/find/DeviceSealingViewFinder';
import { DeviceSealingViewFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceSealingViewFindMessage';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import DeviceSealingViewCache from '../DeviceSealingViewCache';
import DeviceSealingViewClientRateLimiter from '../DeviceSealingViewClientRateLimiter';
import DeviceSealingViewRateLimiter from '../DeviceSealingViewRateLimiter';
import DeviceSealingViewUnknownRateLimiter from '../DeviceSealingViewUnknownRateLimiter';
import { DeviceSealingViewNotFoundError } from '../errors/DeviceSealingViewNotFoundError';
import { DeviceSealingViewViewModel } from '../view-model/DeviceSealingViewViewModel';

@JsonController('/identity-devices')
export class GetDeviceSealingViewRoute extends Route {
  private readonly finder = this.get<DeviceSealingViewFinder>(
    DeviceSealingViewFinder,
  );

  private readonly rateLimiter = this.get<DeviceSealingViewRateLimiter>(
    DeviceSealingViewRateLimiter,
  );

  private readonly clientRateLimiter =
    this.get<DeviceSealingViewClientRateLimiter>(
      DeviceSealingViewClientRateLimiter,
    );

  private readonly unknownRateLimiter =
    this.get<DeviceSealingViewUnknownRateLimiter>(
      DeviceSealingViewUnknownRateLimiter,
    );

  private readonly cache = this.get<DeviceSealingViewCache>(
    DeviceSealingViewCache,
  );

  /**
   * Public: a sender needs it before it holds any credential of the node.
   * Spent in order: the client address (IPv6 per /64), the id check, a few
   * seconds of cache (hits and misses), then the lookup. A known target spends
   * its per-target and node budgets; an unknown id spends only the small
   * unknown-id budget and is never tracked per target.
   */
  @Get('/:identityId/sealing-view')
  public async find(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    this.clientRateLimiter.consume(request.ip);
    const target = new IdentityId(decodeURIComponent(identityId));

    if (!target.isCanonicalKey()) {
      throw new NonCanonicalIdentityIdError();
    }

    const cached = this.cache.find(target);

    if (cached) {
      return response.status(HttpRouteStatusEnum.OK).send(cached);
    }

    if (this.cache.isMissing(target)) {
      throw new DeviceSealingViewNotFoundError();
    }

    try {
      const view = await this.finder.find(
        new DeviceSealingViewFindMessage(target),
      );
      this.rateLimiter.consume(target);
      const resource = new DeviceSealingViewViewModel(
        target,
        view,
      ).toResource();
      this.cache.store(target, resource);

      return response.status(HttpRouteStatusEnum.OK).send(resource);
    } catch (error) {
      if (error instanceof DeviceAuthorizationNotFoundError) {
        this.unknownRateLimiter.consume();
        this.cache.storeMissing(target);

        throw new DeviceSealingViewNotFoundError();
      }

      throw error;
    }
  }
}
