import { RelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';

export class CallTurnRuntimeConfiguration {
  private static readonly VERSION = 1;

  private static isPort(value: number | undefined): value is number {
    return (
      Number.isInteger(value) &&
      value !== undefined &&
      value >= 1 &&
      value <= 65535
    );
  }

  private static isValidRelayPortRange(
    range: [number | undefined, number | undefined],
  ): range is [number, number] {
    const [start, end] = range;

    return this.isPort(start) && this.isPort(end) && end >= start;
  }

  private static isOutsideRelayPortRange(
    listeningPort: number,
    relayPortStart: number,
    relayPortEnd: number,
  ): boolean {
    return listeningPort < relayPortStart || listeningPort > relayPortEnd;
  }

  public static fromRelaySettings(
    settings: RelayRuntimeSettings,
  ): CallTurnRuntimeConfiguration {
    const listeningPort = settings.callsRelay.port;
    const relayPortRange: [number | undefined, number | undefined] = [
      settings.privateRelay.portStart,
      settings.privateRelay.portEnd,
    ];
    const hasCompleteConfiguration =
      settings.publicHost !== undefined &&
      settings.privateRelay.enabled &&
      this.isPort(listeningPort) &&
      this.isValidRelayPortRange(relayPortRange) &&
      this.isOutsideRelayPortRange(
        listeningPort,
        relayPortRange[0],
        relayPortRange[1],
      );

    return new CallTurnRuntimeConfiguration(
      hasCompleteConfiguration,
      settings.publicHost,
      listeningPort,
      relayPortRange[0],
      relayPortRange[1],
    );
  }

  public constructor(
    private readonly enabled: boolean,
    private readonly publicHost: string | undefined,
    private readonly listeningPort: number | undefined,
    private readonly relayPortStart: number | undefined,
    private readonly relayPortEnd: number | undefined,
  ) {}

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getTurnUrls(transports: string[]): string[] {
    if (
      !this.enabled ||
      this.publicHost === undefined ||
      this.listeningPort === undefined
    ) {
      return [];
    }

    return transports.map(
      (transport) =>
        `turn:${this.publicHost}:${this.listeningPort}?transport=${transport}`,
    );
  }

  public serialize(): string {
    const lines = [
      `version=${CallTurnRuntimeConfiguration.VERSION}`,
      `enabled=${this.enabled}`,
    ];

    if (
      this.enabled &&
      this.listeningPort !== undefined &&
      this.relayPortStart !== undefined &&
      this.relayPortEnd !== undefined
    ) {
      lines.push(
        `listening_port=${this.listeningPort}`,
        `relay_port_start=${this.relayPortStart}`,
        `relay_port_end=${this.relayPortEnd}`,
      );
    }

    return `${lines.join('\n')}\n`;
  }
}
