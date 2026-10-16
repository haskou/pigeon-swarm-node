import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { SignedRequestBodyHash } from '@app/apps/apis/shared/SignedRequestBodyHash';
import { SignedRequestBodyReader } from '@app/apps/apis/shared/SignedRequestBodyReader';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { NextFunction, Request, Response } from 'express';
import {
  BadRequestError,
  ExpressMiddlewareInterface,
} from 'routing-controllers';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NodeBlockListUploadInProgressError } from '../errors/NodeBlockListUploadInProgressError';

/**
 * Authenticates a block list upload before reading its body. The signature
 * covers the declared `X-Body-Hash`, so signature, freshness, replay, block
 * and owner checks all run on headers alone. Only then, holding the single
 * upload slot (a concurrent upload gets 429), the body is streamed up to
 * `NODE_BLOCK_LIST_MAX_BYTES` and parsed once it matches the signed hash.
 */
export class NodeBlockListUploadPreflight
  extends Route
  implements ExpressMiddlewareInterface
{
  private static uploadInFlight = false;

  private async authenticateOwner(
    request: Request,
  ): Promise<SignedRequestBodyHash> {
    const { bodyHash, identityId } =
      await this.get<SignedHttpRequestAuthenticator>(
        SignedHttpRequestAuthenticator,
      ).authenticateDeclaredBody(request);
    const node = await this.get<NodeLoader>(NodeLoader).loadNode();

    if (!node.isOwnedBy(identityId)) {
      throw new AuthenticatedIdentityIsNotNodeOwnerError();
    }

    return bodyHash;
  }

  /** Holds the single upload slot until the response is closed. */
  private acquireUploadSlot(response: Response): void {
    if (NodeBlockListUploadPreflight.uploadInFlight) {
      throw new NodeBlockListUploadInProgressError();
    }

    response.once('close', () => {
      NodeBlockListUploadPreflight.uploadInFlight = false;
    });
    NodeBlockListUploadPreflight.uploadInFlight = true;
  }

  private parse(bytes: Buffer): unknown {
    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new BadRequestError('Node block list body must be valid JSON.');
    }
  }

  private async readSignedBody(
    request: Request,
    response: Response,
  ): Promise<void> {
    const bodyHash = await this.authenticateOwner(request);

    this.acquireUploadSlot(response);
    request.body = this.parse(
      await new SignedRequestBodyReader(
        pigeonEnvironment().NODE_BLOCK_LIST_MAX_BYTES,
      ).read(request, bodyHash),
    );
  }

  public use(request: Request, response: Response, next: NextFunction): void {
    this.readSignedBody(request, response).then(() => next(), next);
  }
}
