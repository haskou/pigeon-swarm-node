import NodeReadiness from '@app/apps/NodeReadiness';
import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import { IdentityNotFoundError } from '@app/contexts/identities/domain/errors/IdentityNotFoundError';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

import { IdentityViewModel } from '../view-model/IdentityViewModel';

@JsonController('/identities')
export class GetIdentityRoute extends Route {
  private readonly finder: IdentityFinder =
    this.get<IdentityFinder>(IdentityFinder);

  private readonly readiness: NodeReadiness =
    this.get<NodeReadiness>(NodeReadiness);

  /**
   * A miss is genuine only if replicated state was still ready when the lookup
   * ended. The gate ran before the lookup, so state that closed during it could
   * hide the identity.
   */
  private async findCandidate(identityId: string): Promise<IdentityCandidate> {
    try {
      return await this.finder.findCandidate(
        new IdentityFinderMessage(decodeURIComponent(identityId)),
      );
    } catch (error) {
      if (
        error instanceof IdentityNotFoundError &&
        !(await this.readiness.isReady())
      ) {
        throw new ReplicatedStateNotReadyError();
      }

      throw error;
    }
  }

  @Get('/:identityId')
  public async getIdentity(
    @Param('identityId') identityId: string,
    @Res() response: Response,
  ): Promise<Response> {
    // Not ready: the node is still starting, or a configured network has not
    // finished opening its replicated state, so a miss cannot be told apart
    // from one still replaying. A fresh node holds no network to replay.
    if (!(await this.readiness.isReady())) {
      throw new ReplicatedStateNotReadyError();
    }

    const candidate = await this.findCandidate(identityId);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new IdentityViewModel(
          candidate.getIdentity(),
          candidate.getExternalIdentifier(),
        ).toResource(),
      );
  }
}
