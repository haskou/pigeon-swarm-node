import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { assertSignedRequestTimestampIsFresh } from '@app/apps/apis/shared/SignedRequestFreshness';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import express, { NextFunction, Request, Response } from 'express';
import { ExpressMiddlewareInterface } from 'routing-controllers';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';

/**
 * Runs before the block list body is read: only a fresh request claiming to be
 * the current owner may make this node buffer up to
 * `NODE_BLOCK_LIST_MAX_BYTES`. The route still verifies the full signature.
 */
export class NodeBlockListUploadPreflight
  extends Route
  implements ExpressMiddlewareInterface
{
  private readonly verifier = new SignedHttpRequestVerifier();

  private claimedIdentityId(request: Request): IdentityId {
    const header = this.verifier.getRequiredHeader(request, 'x-identity-id');

    try {
      return new IdentityId(header);
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  private async assertClaimsCurrentOwner(request: Request): Promise<void> {
    const identityId = this.claimedIdentityId(request);

    assertSignedRequestTimestampIsFresh(
      this.verifier.getRequiredHeader(request, 'x-timestamp'),
    );

    const node = await this.get<NodeLoader>(NodeLoader).loadNode();

    if (!node.isOwnedBy(identityId)) {
      throw new AuthenticatedIdentityIsNotNodeOwnerError();
    }
  }

  public use(request: Request, response: Response, next: NextFunction): void {
    this.assertClaimsCurrentOwner(request).then(
      () =>
        express.json({
          limit: pigeonEnvironment().NODE_BLOCK_LIST_MAX_BYTES,
        })(request, response, (error?: unknown) => {
          // routing-controllers parses `@Body` again with body-parser 1.x,
          // which skips a request whose `_body` flag is set. Express 5's
          // parser does not set it, and the stream is already consumed.
          (request as Request & { _body?: boolean })._body = true;
          next(error);
        }),
      next,
    );
  }
}
