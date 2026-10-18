import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { NodeOwnerWriteHolderMessage } from '@app/contexts/nodes/application/hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { NodeCanOnlyBeManagedByItsOwnerError } from '@app/contexts/nodes/domain/errors/NodeCanOnlyBeManagedByItsOwnerError';
import { NodeOwnerResetIsRequiredError } from '@app/contexts/nodes/domain/errors/NodeOwnerResetIsRequiredError';
import { Node } from '@app/contexts/nodes/domain/Node';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { assert } from '@haskou/value-objects';
import { Request } from 'express';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NodeOwnerClaimIsAwaitingResetError } from '../errors/NodeOwnerClaimIsAwaitingResetError';

/**
 * Owner-only routes check the signer owns the node up front, and the write
 * checks it again as it lands: a handover in between refuses it as well.
 */
export abstract class NodeOwnerRouteSupport extends Route {
  protected readonly nodeLoader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly ownerWriteHolder =
    this.get<NodeOwnerWriteHolder>(NodeOwnerWriteHolder);

  private async assertAuthenticatedOwner(
    request: Request,
    node: Node,
  ): Promise<IdentityId> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    assert(
      node.isOwnedBy(authenticatedIdentityId),
      new AuthenticatedIdentityIsNotNodeOwnerError(),
    );

    return authenticatedIdentityId;
  }

  /** Answers a write refused because the node changed hands as a non-owner. */
  private async asOwner<T>(write: Promise<T>): Promise<T> {
    try {
      return await write;
    } catch (error: unknown) {
      if (error instanceof NodeCanOnlyBeManagedByItsOwnerError) {
        throw new AuthenticatedIdentityIsNotNodeOwnerError();
      }

      throw error;
    }
  }

  protected async authenticateNodeOwner(request: Request): Promise<IdentityId> {
    return this.assertAuthenticatedOwner(
      request,
      await this.nodeLoader.loadNode(),
    );
  }

  protected async assertOwnerCanManageNode(request: Request): Promise<void> {
    await this.authenticateNodeOwner(request);
  }

  /** Runs a node setting change, which checks the owner as it lands. */
  protected async changeNodeAsOwner<T>(
    request: Request,
    change: (authenticatedIdentityId: IdentityId) => Promise<T>,
  ): Promise<T> {
    return this.asOwner(change(await this.authenticateNodeOwner(request)));
  }

  /**
   * Runs a node setting change anyone may make while nobody claimed the node,
   * and only its owner afterwards; the change checks the owner as it lands.
   */
  protected async setUpNodeAsOwnerWhenClaimed<T>(
    request: Request,
    change: (authenticatedIdentityId: IdentityId | undefined) => Promise<T>,
  ): Promise<T> {
    const node = await this.nodeLoader.loadNode();
    const authenticatedIdentityId = node.hasOwner()
      ? await this.assertAuthenticatedOwner(request, node)
      : undefined;

    try {
      return await this.asOwner(change(authenticatedIdentityId));
    } catch (error: unknown) {
      if (error instanceof NodeOwnerResetIsRequiredError) {
        throw new NodeOwnerClaimIsAwaitingResetError();
      }

      throw error;
    }
  }

  /** Runs an owner-only write stored outside the node while it cannot change hands. */
  protected async writeAsNodeOwner<T>(
    request: Request,
    write: (authenticatedIdentityId: IdentityId) => Promise<T>,
  ): Promise<T> {
    const authenticatedIdentityId = await this.authenticateNodeOwner(request);

    return this.asOwner(
      this.ownerWriteHolder.hold(
        new NodeOwnerWriteHolderMessage(authenticatedIdentityId.valueOf()),
        async () => write(authenticatedIdentityId),
      ),
    );
  }

  /**
   * Runs `prepare` for the authenticated owner outside the node hold, then the
   * write of its result while the node is held for that owner. A handover
   * while `prepare` runs refuses the write as a non-owner.
   */
  protected async prepareThenWriteAsNodeOwner<P, T>(
    request: Request,
    prepare: (authenticatedIdentityId: IdentityId) => Promise<P>,
    write: (authenticatedIdentityId: IdentityId, prepared: P) => Promise<T>,
  ): Promise<T> {
    const owner = await this.authenticateNodeOwner(request);
    const prepared = await prepare(owner);

    return this.asOwner(
      this.ownerWriteHolder.hold(
        new NodeOwnerWriteHolderMessage(owner.valueOf()),
        () => write(owner, prepared),
      ),
    );
  }
}
