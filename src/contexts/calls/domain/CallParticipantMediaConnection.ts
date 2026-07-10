import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, ValueObject } from '@haskou/value-objects';

import { CallIceCandidateType } from './value-objects/CallIceCandidateType';
import { CallMediaConnectionProtocol } from './value-objects/CallMediaConnectionProtocol';
import { CallMediaConnectionState } from './value-objects/CallMediaConnectionState';
import { CallRelayUrl } from './value-objects/CallRelayUrl';

export class CallParticipantMediaConnection extends ValueObject<{
  localCandidateType?: string;
  protocol?: string;
  relayProtocol?: string;
  relayUrl?: string;
  remoteCandidateType?: string;
  remoteIdentityId: string;
  state: string;
}> {
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
    remoteIdentityId: IdentityId,
    state: CallMediaConnectionState,
    localCandidateType?: CallIceCandidateType,
    remoteCandidateType?: CallIceCandidateType,
    relayUrl?: CallRelayUrl,
    protocol?: CallMediaConnectionProtocol,
    relayProtocol?: CallMediaConnectionProtocol,
  ) {
    super({
      localCandidateType: localCandidateType?.valueOf(),
      protocol: protocol?.valueOf(),
      relayProtocol: relayProtocol?.valueOf(),
      relayUrl: relayUrl?.valueOf(),
      remoteCandidateType: remoteCandidateType?.valueOf(),
      remoteIdentityId: remoteIdentityId.valueOf(),
      state: state.valueOf(),
    });
  }

  public isFor(identityId: IdentityId): boolean {
    return new IdentityId(this.value.remoteIdentityId).isEqual(identityId);
  }

  public getRemoteIdentityId(): IdentityId {
    return new IdentityId(this.value.remoteIdentityId);
  }

  public usesRelay(): boolean {
    return (
      (this.value.localCandidateType
        ? CallIceCandidateType.fromPrimitives(
            this.value.localCandidateType,
          ).isRelay()
        : false) ||
      (this.value.remoteCandidateType
        ? CallIceCandidateType.fromPrimitives(
            this.value.remoteCandidateType,
          ).isRelay()
        : false)
    );
  }

  public toPrimitives() {
    return this.valueOf();
  }
}
