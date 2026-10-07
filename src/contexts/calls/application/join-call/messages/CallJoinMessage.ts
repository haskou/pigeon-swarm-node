import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CallId } from '../../../domain/value-objects/CallId';

export class CallJoinMessage {
  private readonly proof: PublicMutationProof;
  public readonly at: Timestamp;
  public readonly callId: CallId;
  public readonly participantIdentityId: IdentityId;

  constructor(
    callId: string,
    participantIdentityId: string,
    mutation: unknown,
    at: number,
  ) {
    this.at = new Timestamp(at);
    this.callId = new CallId(callId);
    this.participantIdentityId = new IdentityId(participantIdentityId);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
  }

  public getProof(): PublicMutationProof {
    return this.proof;
  }
}
