import { NodeRegistrationCodeIssuerMessage } from '@app/contexts/nodes/application/issue-registration-code/messages/NodeRegistrationCodeIssuerMessage';
import NodeRegistrationCodeIssuer from '@app/contexts/nodes/application/issue-registration-code/NodeRegistrationCodeIssuer';
import { NodeRegistrationCodeExpiryIsOutOfRangeError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeExpiryIsOutOfRangeError';
import { NodeRegistrationCodeMaxUsesIsOutOfRangeError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeMaxUsesIsOutOfRangeError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostNodeRegistrationCodeBody } from '../bodies/PostNodeRegistrationCodeBody';
import { InvalidNodeRegistrationCodeRequestError } from '../errors/InvalidNodeRegistrationCodeRequestError';
import { IssuedNodeRegistrationCodeViewModel } from '../view-model/IssuedNodeRegistrationCodeViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/registration-codes')
export class PostNodeRegistrationCodeRoute extends NodeOwnerRouteSupport {
  private readonly issuer = this.get<NodeRegistrationCodeIssuer>(
    NodeRegistrationCodeIssuer,
  );

  @Post('/')
  public async postRegistrationCode(
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PostNodeRegistrationCodeBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const issued = await this.writeAsNodeOwner(request, () =>
        this.issuer.issue(
          new NodeRegistrationCodeIssuerMessage(body.expiresAt, body.maxUses),
        ),
      );

      response.setHeader('Cache-Control', 'no-store');

      return response
        .status(HttpRouteStatusEnum.CREATED)
        .send(new IssuedNodeRegistrationCodeViewModel(issued).toResource());
    } catch (error: unknown) {
      if (
        error instanceof NodeRegistrationCodeMaxUsesIsOutOfRangeError ||
        error instanceof NodeRegistrationCodeExpiryIsOutOfRangeError
      ) {
        throw new InvalidNodeRegistrationCodeRequestError(error.message);
      }

      throw error;
    }
  }
}
