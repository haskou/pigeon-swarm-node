import { NonCanonicalIdentityIdError } from '@app/apps/apis/shared/errors/NonCanonicalIdentityIdError';
import { NodeBlockListStorerMessage } from '@app/contexts/nodes/application/store-block-list/messages/NodeBlockListStorerMessage';
import NodeBlockListStorer from '@app/contexts/nodes/application/store-block-list/NodeBlockListStorer';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { Request, Response } from 'express';
import {
  BadRequestError,
  JsonController,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutNodeBlocksBody } from '../bodies/PutNodeBlocksBody';
import { NodeBlockListUploadPreflight } from '../NodeBlockListUploadPreflight';
import { NodeBlocksViewModel } from '../view-model/NodeBlocksViewModel';

/**
 * The preflight authenticates the owner before reading the signed body and
 * returns it parsed, so this route only validates the document before storing
 * it. A list blocking an identity id that is not the canonical encoding of a
 * key is refused (400080): no request can be made under such an id.
 */
@JsonController('/node/blocks')
export class PutNodeBlocksRoute extends Route {
  private readonly preflight = new NodeBlockListUploadPreflight();

  private readonly storer: NodeBlockListStorer =
    this.get<NodeBlockListStorer>(NodeBlockListStorer);

  private async validBody(body: unknown): Promise<PutNodeBlocksBody> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestError('Node block list body must be a JSON object.');
    }

    const document = plainToInstance(PutNodeBlocksBody, body);

    try {
      await validateOrReject(document, {
        forbidNonWhitelisted: true,
        forbidUnknownValues: false,
        validationError: { target: false, value: false },
        whitelist: true,
      });
    } catch (errors) {
      throw Object.assign(
        new BadRequestError(
          "Invalid body, check 'errors' property for more info.",
        ),
        { errors },
      );
    }

    return document;
  }

  @Put('/')
  public async putBlocks(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const body = await this.validBody(
      await this.preflight.read(request, response),
    );
    const message = new NodeBlockListStorerMessage({
      blockedIdentityIds: body.blockedIdentityIds,
      blockedNodePeerIds: body.blockedNodePeerIds,
      identitySignature: body.identitySignature,
      issuedAt: body.issuedAt,
      ownerIdentityId: body.ownerIdentityId,
      type: body.type,
      version: body.version,
    });

    if (
      !message.blockList
        .getBlockedIdentityIds()
        .every((identityId) => identityId.isCanonicalKey())
    ) {
      throw new NonCanonicalIdentityIdError();
    }

    const blockList = await this.storer.store(message);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeBlocksViewModel(blockList).toResource());
  }
}
