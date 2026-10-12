export interface DeviceCompromisedCredentialResource {
  compromisedSince: number;
  credential: string;
}

export interface DeviceAuthorizationResource {
  compromisedCredentials: DeviceCompromisedCredentialResource[];
  epoch: string;
  identityId: string;
  revision: number;
}
