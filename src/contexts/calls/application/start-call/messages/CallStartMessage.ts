import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallScope } from '../../../domain/CallScope';
import { InvalidCallScopeError } from '../../../domain/errors/InvalidCallScopeError';
import { CallCapabilityHash } from '../../../domain/value-objects/CallCapabilityHash';
import { CallNonce } from '../../../domain/value-objects/CallNonce';
import { CallScopeType } from '../../../domain/value-objects/CallScopeType';
import { CallSessionEpoch } from '../../../domain/value-objects/CallSessionEpoch';

export class CallStartMessage {
  private readonly proof: PublicMutationProof;
  public readonly capabilityHash?: CallCapabilityHash;
  public readonly channelId?: CommunityChannelId;
  public readonly communityId?: CommunityId;
  public readonly conversationId?: ConversationId;
  /** The network of a group-capability call, which no scope implies. */
  public readonly networkId?: NetworkId;
  public readonly nonce: CallNonce;
  public readonly requesterIdentityId: IdentityId;
  public readonly scopeType: CallScopeType;
  public readonly sessionEpoch?: CallSessionEpoch;
  public readonly startedAt: Timestamp;

  constructor(
    requesterIdentityId: string,
    scope: PrimitiveOf<CallScope> & { networkId?: string },
    mutation: unknown,
    nonce: string,
    startedAt: number,
    sessionEpoch?: number,
  ) {
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
    this.scopeType = new CallScopeType(scope.type);
    this.conversationId = scope.conversationId
      ? new ConversationId(scope.conversationId)
      : undefined;
    this.communityId = scope.communityId
      ? new CommunityId(scope.communityId)
      : undefined;
    this.channelId = scope.channelId
      ? new CommunityChannelId(scope.channelId)
      : undefined;
    this.capabilityHash = scope.capabilityHash
      ? new CallCapabilityHash(scope.capabilityHash)
      : undefined;
    this.networkId = scope.networkId
      ? new NetworkId(scope.networkId)
      : undefined;
    this.nonce = new CallNonce(nonce);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
    this.sessionEpoch =
      sessionEpoch === undefined
        ? undefined
        : new CallSessionEpoch(sessionEpoch);
    this.startedAt = new Timestamp(startedAt);
  }

  public getProof(): PublicMutationProof {
    return this.proof;
  }

  public getCapabilityHash(): CallCapabilityHash {
    if (!this.capabilityHash) {
      throw new InvalidCallScopeError();
    }

    return this.capabilityHash;
  }

  public getNetworkId(): NetworkId {
    if (!this.networkId) {
      throw new InvalidCallScopeError();
    }

    return this.networkId;
  }

  public getCommunityChannelId(): CommunityChannelId {
    if (!this.channelId) {
      throw new InvalidCallScopeError();
    }

    return this.channelId;
  }

  public getCommunityId(): CommunityId {
    if (!this.communityId) {
      throw new InvalidCallScopeError();
    }

    return this.communityId;
  }

  public getConversationId(): ConversationId {
    if (!this.conversationId) {
      throw new InvalidCallScopeError();
    }

    return this.conversationId;
  }
}
