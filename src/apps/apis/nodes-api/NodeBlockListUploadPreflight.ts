import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { SignedRequestBodyHash } from '@app/apps/apis/shared/SignedRequestBodyHash';
import { SignedRequestBodyReader } from '@app/apps/apis/shared/SignedRequestBodyReader';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request, Response } from 'express';
import { BadRequestError } from 'routing-controllers';

import { AuthenticatedIdentityIsNotNodeOwnerError } from './errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NodeBlockListUploadInProgressError } from './errors/NodeBlockListUploadInProgressError';

/**
 * Authenticates a block list upload before reading its body. The signature
 * covers the declared `X-Body-Hash`, so signature, freshness, replay, block
 * and owner checks all run on headers alone. Only then, holding the single
 * upload slot (a concurrent upload gets 429), the body is streamed up to
 * `NODE_BLOCK_LIST_MAX_BYTES` within `NODE_BLOCK_LIST_BODY_TIMEOUT_MS` and
 * parsed once it matches the signed hash. A failed, slow or aborted read frees
 * the slot at once; a successful one holds it until the response closes.
 */
export class NodeBlockListUploadPreflight extends Route {
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

  /** Holds the single upload slot; returns its release. */
  private acquireUploadSlot(response: Response): () => void {
    if (NodeBlockListUploadPreflight.uploadInFlight) {
      throw new NodeBlockListUploadInProgressError();
    }

    NodeBlockListUploadPreflight.uploadInFlight = true;
    let held = true;
    const release = (): void => {
      if (held) {
        held = false;
        NodeBlockListUploadPreflight.uploadInFlight = false;
      }
    };
    response.once('close', release);

    return release;
  }

  private parse(bytes: Buffer): unknown {
    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new BadRequestError('Node block list body must be valid JSON.');
    }
  }

  /** Returns the parsed body of an authenticated owner upload. */
  public async read(request: Request, response: Response): Promise<unknown> {
    const bodyHash = await this.authenticateOwner(request);
    const environment = pigeonEnvironment();
    const releaseUploadSlot = this.acquireUploadSlot(response);

    try {
      return this.parse(
        await new SignedRequestBodyReader(
          environment.NODE_BLOCK_LIST_MAX_BYTES,
          environment.NODE_BLOCK_LIST_BODY_TIMEOUT_MS,
        ).read(request, bodyHash),
      );
    } catch (error: unknown) {
      // The rest of a refused body stays unread; do not keep its socket.
      response.setHeader('Connection', 'close');
      releaseUploadSlot();

      throw error;
    }
  }
}
