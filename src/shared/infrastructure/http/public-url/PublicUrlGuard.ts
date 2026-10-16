import { lookup } from 'dns/promises';
import net from 'net';

import { ResolvedPublicUrl } from './ResolvedPublicUrl';
import { UrlIsNotPublicError } from './UrlIsNotPublicError';

/**
 * Refuses URLs that would make this node call itself or its private network:
 * non-http(s) schemes, localhost names and private, loopback, link-local,
 * shared, benchmark, multicast or reserved addresses, including every address
 * a hostname resolves to. Callers connect only to the checked addresses, so a
 * second DNS answer cannot swap in a private one.
 */
export default class PublicUrlGuard {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];
  /** Loopback, private, link-local, this-network, shared, IETF, benchmark, multicast and reserved. */
  private static readonly BLOCKED_IPV4_RANGES: [string, number][] = [
    ['127.0.0.0', 8],
    ['10.0.0.0', 8],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['169.254.0.0', 16],
    ['0.0.0.0', 8],
    ['100.64.0.0', 10],
    ['192.0.0.0', 24],
    ['198.18.0.0', 15],
    ['224.0.0.0', 3],
  ];

  private assertAllowedProtocol(url: URL): void {
    if (!PublicUrlGuard.ALLOWED_PROTOCOLS.includes(url.protocol)) {
      throw new UrlIsNotPublicError('Only http and https URLs are allowed.');
    }
  }

  private assertAllowedHostname(url: URL): void {
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.length === 0
    ) {
      throw new UrlIsNotPublicError('Localhost URLs are not allowed.');
    }
  }

  private ipv4ToNumber(address: string): number {
    return address
      .split('.')
      .map(Number)
      .reduce((result, octet) => result * 256 + octet, 0);
  }

  private isIpv4InRange(
    address: string,
    base: string,
    maskBits: number,
  ): boolean {
    const baseAddress = this.ipv4ToNumber(base);
    const targetAddress = this.ipv4ToNumber(address);
    const size = 2 ** (32 - maskBits);

    return targetAddress >= baseAddress && targetAddress < baseAddress + size;
  }

  private normalizedAddress(address: string): string {
    const normalized = address.toLowerCase();

    if (normalized.startsWith('[') && normalized.endsWith(']')) {
      return normalized.slice(1, -1);
    }

    return normalized;
  }

  private isBlockedIpv4(address: string): boolean {
    return PublicUrlGuard.BLOCKED_IPV4_RANGES.some(([base, prefixLength]) =>
      this.isIpv4InRange(address, base, prefixLength),
    );
  }

  private ipv6GroupHextets(group: string): number[] {
    if (group === '') {
      return [];
    }

    return group.split(':').flatMap((hextet) => {
      if (net.isIP(hextet) !== 4) {
        return [parseInt(hextet, 16)];
      }

      const ipv4 = this.ipv4ToNumber(hextet);

      return [Math.floor(ipv4 / 65536), ipv4 % 65536];
    });
  }

  /** The eight hextets of a valid IPv6 address, with `::` expanded. */
  private ipv6Hextets(address: string): number[] {
    const [head, tail] = address.split('::');
    const headHextets = this.ipv6GroupHextets(head);
    const tailHextets = this.ipv6GroupHextets(tail ?? '');
    const zeros = new Array<number>(
      8 - headHextets.length - tailHextets.length,
    ).fill(0);

    return [...headHextets, ...zeros, ...tailHextets];
  }

  private embeddedIpv4(high: number, low: number): string {
    return [
      Math.floor(high / 256),
      high % 256,
      Math.floor(low / 256),
      low % 256,
    ].join('.');
  }

  private areZero(hextets: number[]): boolean {
    return hextets.every((hextet) => hextet === 0);
  }

  /** An IPv4-mapped address (::ffff:0:0/96), however it is spelled. */
  private isMappedIpv4(hextets: number[]): boolean {
    return this.areZero(hextets.slice(0, 5)) && hextets[5] === 0xffff;
  }

  /**
   * Inside global unicast (2000::/3): IETF protocol assignments including
   * Teredo (2001::/23), documentation (2001:db8::/32, 3fff::/20), 6to4
   * (2002::/16) and SRv6 SIDs (5f00::/16) are never public services.
   */
  private isReservedGlobalIpv6([first, second]: number[]): boolean {
    return (
      (first === 0x2001 && (second < 0x200 || second === 0x0db8)) ||
      first === 0x2002 ||
      (first === 0x3fff && second < 0x1000) ||
      first === 0x5f00
    );
  }

  /**
   * Only global unicast (2000::/3) is allowed, which refuses unspecified,
   * loopback, IPv4-compatible and -translated, NAT64, discard-only, unique
   * local, link-local, site-local and multicast addresses. IPv4-mapped
   * addresses are judged by the IPv4 address they carry.
   */
  private isBlockedIpv6(address: string): boolean {
    const hextets = this.ipv6Hextets(this.normalizedAddress(address));

    if (this.isMappedIpv4(hextets)) {
      return this.isBlockedIpv4(this.embeddedIpv4(hextets[6], hextets[7]));
    }

    return (
      hextets[0] < 0x2000 ||
      hextets[0] > 0x3fff ||
      this.isReservedGlobalIpv6(hextets)
    );
  }

  private assertAllowedAddress(address: string): void {
    const normalized = this.normalizedAddress(address);
    const family = net.isIP(normalized);

    if (family === 4 && this.isBlockedIpv4(normalized)) {
      throw new UrlIsNotPublicError('Private IP addresses are not allowed.');
    }

    if (family === 6 && this.isBlockedIpv6(normalized)) {
      throw new UrlIsNotPublicError('Private IP addresses are not allowed.');
    }
  }

  public parse(rawUrl: string): URL {
    let url: URL;

    try {
      url = new URL(rawUrl);
    } catch {
      throw new UrlIsNotPublicError('Invalid URL.');
    }

    this.assertAllowedProtocol(url);
    this.assertAllowedHostname(url);

    if (net.isIP(this.normalizedAddress(url.hostname))) {
      this.assertAllowedAddress(url.hostname);
    }

    return url;
  }

  public async resolve(rawUrl: string | URL): Promise<ResolvedPublicUrl> {
    const url =
      typeof rawUrl === 'string'
        ? this.parse(rawUrl)
        : this.parse(rawUrl.toString());
    const addresses = await lookup(url.hostname, {
      all: true,
      verbatim: true,
    });

    if (addresses.length === 0) {
      throw new UrlIsNotPublicError('URL hostname could not be resolved.');
    }

    addresses.forEach((address) => this.assertAllowedAddress(address.address));

    return {
      addresses: addresses.map(({ address, family }) => ({
        address,
        family: family as 4 | 6,
      })),
      url,
    };
  }
}
