export interface DeviceSealingViewResource {
  devices: {
    deviceCredential: string;
    sealingKeys: { sealingPublicKey: string; utcDay: string }[];
  }[];
  identityId: string;
  revision: number;
}
