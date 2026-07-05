export class PutNodeRelayConfigurationBody {
  public callsRelay?: {
    port?: number;
  };

  public manualRelayMultiaddrs?: string[];

  public privateRelay?: {
    discoveryEnabled?: boolean;
    enabled?: boolean;
    portEnd?: number;
    portStart?: number;
    publicationEnabled?: boolean;
    publicRecordDiscoveryEnabled?: boolean;
    publicRecordPublicationEnabled?: boolean;
  };

  public publicHost?: string;
}
