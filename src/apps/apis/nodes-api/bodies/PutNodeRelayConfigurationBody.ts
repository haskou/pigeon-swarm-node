export class PutNodeRelayConfigurationBody {
  public callsRelay?: {
    port?: number;
  };

  public manualRelayMultiaddrs?: string[];

  public privateRelay?: {
    enabled?: boolean;
    portEnd?: number;
    portStart?: number;
    publicRecordDiscoveryEnabled?: boolean;
    publicRecordPublicationEnabled?: boolean;
  };

  public publicHost?: string;

  public publicRelay?: {
    autoEnabled?: boolean;
    discoveryEnabled?: boolean;
    enabled?: boolean;
    libp2pPort?: number;
    port?: number;
  };
}
