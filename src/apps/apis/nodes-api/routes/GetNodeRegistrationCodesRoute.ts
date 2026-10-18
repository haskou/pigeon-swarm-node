import { PageRequest } from '@app/apps/apis/shared/pagination/PageRequest';
import NodeRegistrationCodesFinder from '@app/contexts/nodes/application/find-registration-codes/NodeRegistrationCodesFinder';
import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { NodeListPositions } from '../requests/NodeListPositions';
import { NodeRegistrationCodesViewModel } from '../view-model/NodeRegistrationCodesViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/registration-codes')
export class GetNodeRegistrationCodesRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeRegistrationCodesFinder>(
    NodeRegistrationCodesFinder,
  );

  @Get()
  public async getRegistrationCodes(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const pageRequest = new PageRequest(
      'registration-codes',
      limit,
      cursor,
      NodeListPositions.registrationCodeId,
    );
    const after = pageRequest.getAfterPosition();
    const { codes } = new NodeRegistrationCodesViewModel(
      await this.finder.find(),
    ).toResource();
    const page = PageSlice.of({
      after,
      items: codes,
      limit: pageRequest.getLimit(),
      order: 'asc',
      position: (code) => code.id,
    });

    return response.status(HttpRouteStatusEnum.OK).send({
      codes: page.items,
      nextCursor: pageRequest.nextCursor(page.nextPosition),
    });
  }
}
