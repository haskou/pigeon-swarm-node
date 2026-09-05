import { CallIceServersDiagnosticsResource } from './resources/CallIceServersDiagnosticsResource';

export class CallIceServerDiagnostics {
  private static readonly nonPublicHostPatterns = [
    /^127\./,
    /^10\./,
    /^169\.254\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^::1$/,
    /^f[cd][0-9a-f]{2}:/i,
    /^fe[89ab][0-9a-f]:/i,
  ];

  public constructor(
    private readonly turnUrls: string[],
    private readonly hasLocalTurnUrls: boolean,
    private readonly turnSharedSecretConfigured: boolean,
  ) {}

  private turnUrlHost(url: string): string {
    const withoutScheme = url.replace(/^turn(s)?:(\/\/)?/, '');

    // Bracketed IPv6 literals such as turn:[fc00::1]:3478 must keep the full
    // address; splitting on ':' would only leave '['.
    if (withoutScheme.startsWith('[')) {
      return withoutScheme.slice(1, withoutScheme.indexOf(']'));
    }

    return withoutScheme.split(/[:/?]/)[0] || '';
  }

  private hasNonPublicHost(url: string): boolean {
    const host = this.turnUrlHost(url).toLowerCase();

    if (host === 'localhost' || host.endsWith('.local')) {
      return true;
    }

    return CallIceServerDiagnostics.nonPublicHostPatterns.some((pattern) =>
      pattern.test(host),
    );
  }

  public toResource(): CallIceServersDiagnosticsResource {
    return {
      nonPublicTurnUrls: this.turnUrls.filter((url) =>
        this.hasNonPublicHost(url),
      ),
      turnSharedSecretConfigured: this.turnSharedSecretConfigured,
      turnSource: this.hasLocalTurnUrls
        ? 'local-configuration'
        : this.turnUrls.length > 0
          ? 'connected-relay-record'
          : 'none',
    };
  }
}
