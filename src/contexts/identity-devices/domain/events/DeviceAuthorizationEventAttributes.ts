export type DeviceAuthorizationEventAttributes = {
  readonly compromisedSince?: number;
  readonly epoch: string;
  readonly identityId: string;
  readonly revision: number;
};
