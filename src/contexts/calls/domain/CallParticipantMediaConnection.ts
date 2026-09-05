import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf } from '@haskou/value-objects';

import { CallIceCandidateType } from './value-objects/CallIceCandidateType';
import { CallMediaConnectionProtocol } from './value-objects/CallMediaConnectionProtocol';
import { CallMediaConnectionState } from './value-objects/CallMediaConnectionState';
import { CallRelayUrl } from './value-objects/CallRelayUrl';

export class CallParticipantMediaConnection {
  public static fromPrimitives(
    primitives: PrimitiveOf<CallParticipantMediaConnection>,
  ): CallParticipantMediaConnection {
    return new CallParticipantMediaConnection(
      new IdentityId(primitives.remoteIdentityId),
      CallMediaConnectionState.fromPrimitives(primitives.state),
      primitives.localCandidateType
        ? CallIceCandidateType.fromPrimitives(primitives.localCandidateType)
        : undefined,
      primitives.remoteCandidateType
        ? CallIceCandidateType.fromPrimitives(primitives.remoteCandidateType)
        : undefined,
      primitives.relayUrl ? new CallRelayUrl(primitives.relayUrl) : undefined,
      primitives.protocol
        ? new CallMediaConnectionProtocol(primitives.protocol)
        : undefined,
      primitives.relayProtocol
        ? new CallMediaConnectionProtocol(primitives.relayProtocol)
        : undefined,
    );
  }

  constructor(
    private readonly remoteIdentityId: IdentityId,
    private readonly state: CallMediaConnectionState,
    private readonly localCandidateType?: CallIceCandidateType,
    private readonly remoteCandidateType?: CallIceCandidateType,
    private readonly relayUrl?: CallRelayUrl,
    private readonly protocol?: CallMediaConnectionProtocol,
    private readonly relayProtocol?: CallMediaConnectionProtocol,
  ) {}

  public isFor(identityId: IdentityId): boolean {
    return this.remoteIdentityId.isEqual(identityId);
  }

  public getRemoteIdentityId(): IdentityId {
    return this.remoteIdentityId;
  }

  public usesRelay(): boolean {
    return (
      (this.localCandidateType?.isRelay() ?? false) ||
      (this.remoteCandidateType?.isRelay() ?? false)
    );
  }

  public isEqual(other: CallParticipantMediaConnection): boolean {
    return (
      JSON.stringify(this.toPrimitives()) ===
      JSON.stringify(other.toPrimitives())
    );
  }

  public toPrimitives(): {
    localCandidateType?: string;
    protocol?: string;
    relayProtocol?: string;
    relayUrl?: string;
    remoteCandidateType?: string;
    remoteIdentityId: string;
    state: string;
  } {
    return {
      localCandidateType: this.localCandidateType?.valueOf(),
      protocol: this.protocol?.valueOf(),
      relayProtocol: this.relayProtocol?.valueOf(),
      relayUrl: this.relayUrl?.valueOf(),
      remoteCandidateType: this.remoteCandidateType?.valueOf(),
      remoteIdentityId: this.remoteIdentityId.valueOf(),
      state: this.state.valueOf(),
    };
  }
}
