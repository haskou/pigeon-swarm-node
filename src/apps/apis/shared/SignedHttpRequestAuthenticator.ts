import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

import { IdentityIsBlockedOnThisNodeError } from './errors/IdentityIsBlockedOnThisNodeError';
import { IdentityIsNotServedByThisNodeError } from './errors/IdentityIsNotServedByThisNodeError';
import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { NonCanonicalIdentityIdError } from './errors/NonCanonicalIdentityIdError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';
import { SignedRequestBodyHash } from './SignedRequestBodyHash';
import { assertSignedRequestTimestampIsFresh } from './SignedRequestFreshness';
import { signedRequestReplayGuard } from './SignedRequestReplayGuard';

export default class SignedHttpRequestAuthenticator {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  private readonly verifier = new SignedHttpRequestVerifier();

  constructor(
    private readonly blockPolicy: NodeBlockPolicy,
    private readonly identityRepository: IdentityRepository,
    private readonly nodes: NodeRepository,
  ) {}

  /**
   * Whether this node holds the identity. A node that has not opened its
   * replicated state yet holds nobody, so every signer counts as a stranger.
   */
  private async holds(identityId: IdentityId): Promise<boolean> {
    try {
      return await this.identityRepository.holds(identityId);
    } catch (error) {
      if (error instanceof ReplicatedStateNotReadyError) {
        return false;
      }

      throw error;
    }
  }

  /**
   * Whether this node serves the signer: it holds the identity, or the
   * identity owns the node, so the owner can manage the node even when its
   * identity lives elsewhere or the replicated state is not open yet.
   */
  private async serves(identityId: IdentityId): Promise<boolean> {
    return (
      (await this.holds(identityId)) ||
      this.nodes.isLocalNodeOwnedBy(identityId)
    );
  }

  /**
   * Records a state-changing request once, after every other check passed.
   * Every signer takes a slot charged to the request's client address: a
   * signer this node serves in its share of the replay guard, a signer it
   * does not serve, such as an identity creating itself here, in the share
   * kept for strangers.
   */
  private async assertIsNotReplayed(
    request: Request,
    identityId: IdentityId,
    signature: Signature,
  ): Promise<void> {
    if (
      SignedHttpRequestAuthenticator.SAFE_METHODS.has(
        request.method.toUpperCase(),
      )
    ) {
      return;
    }

    const clientAddress = request.ip ?? 'unknown';
    const accepted = (await this.serves(identityId))
      ? signedRequestReplayGuard.accept(identityId, signature, clientAddress)
      : signedRequestReplayGuard.acceptFromStranger(
          identityId,
          signature,
          clientAddress,
        );

    if (!accepted) {
      throw new InvalidSignedRequestError();
    }
  }

  private async admit(
    request: Request,
    identityId: IdentityId,
    signature: Signature,
    timestamp: string,
  ): Promise<void> {
    assertSignedRequestTimestampIsFresh(timestamp);
    await this.assertIsNotBlocked(identityId);
    await this.assertIsNotReplayed(request, identityId, signature);
  }

  /** Verifies the request signature and refuses identities blocked on this node (403012). */
  public async authenticate(request: Request): Promise<IdentityId> {
    const { identityId, signature, timestamp } =
      this.verifier.verifySignature(request);

    await this.admit(request, identityId, signature, timestamp);

    return identityId;
  }

  /**
   * Authenticates like `authenticate`, then refuses (403014) a signer this
   * node does not serve: any self-generated key can sign, so the signature
   * alone proves nothing about who the caller is.
   */
  public async authenticateServed(request: Request): Promise<IdentityId> {
    const identityId = await this.authenticate(request);

    if (!(await this.serves(identityId))) {
      throw new IdentityIsNotServedByThisNodeError();
    }

    return identityId;
  }

  /**
   * Authenticates a request from its headers alone: the signature covers the
   * declared `X-Body-Hash` instead of the body, so no body byte is read. The
   * caller must only accept a body that matches the returned hash.
   */
  public async authenticateDeclaredBody(
    request: Request,
  ): Promise<{ bodyHash: SignedRequestBodyHash; identityId: IdentityId }> {
    const { bodyHash, identityId, signature, timestamp } =
      this.verifier.verifyDeclaredBodySignature(request);

    await this.admit(request, identityId, signature, timestamp);

    return { bodyHash, identityId };
  }

  /**
   * Refuses an identity blocked on this node (403012). Block entries hold
   * canonical ids compared as strings, so an alias encoding of a blocked key
   * would never match its entry: an id that is not the canonical encoding of a
   * usable key is refused first (400080), before the block list is read.
   */
  public async assertIsNotBlocked(identityId: IdentityId): Promise<void> {
    if (!identityId.isCanonicalKey()) {
      throw new NonCanonicalIdentityIdError();
    }

    if (await this.blockPolicy.isIdentityBlocked(identityId)) {
      throw new IdentityIsBlockedOnThisNodeError();
    }
  }
}
