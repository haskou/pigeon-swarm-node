export type CallParticipantMediaConnectionResource = {
  localCandidateType?: string;
  protocol?: string;
  relayProtocol?: string;
  relayUrl?: string;
  remoteCandidateType?: string;
  remoteIdentityId: string;
  state: string;
  usesRelay: boolean;
};
