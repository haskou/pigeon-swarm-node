import { lookup } from 'dns/promises';
import net from 'net';

import { ResolvedPublicUrl } from './ResolvedPublicUrl';
import { UrlIsNotPublicError } from './UrlIsNotPublicError';

/**
 * Refuses URLs that would make this node call itself or its private network:
 * non-http(s) schemes, localhost names and private, loopback, link-local,
 * shared, benchmark, multicast or reserved addresses, including every address
 * a hostname resolves to. Callers connect to the resolved address only, so a
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

  private mappedIpv4Address(address: string): string | undefined {
    if (!address.startsWith('::ffff:')) {
      return undefined;
    }

    const suffix = address.replace('::ffff:', '');

    if (net.isIP(suffix) === 4) {
      return suffix;
    }

    return this.mappedIpv4AddressFromHextets(suffix.split(':'));
  }

  private mappedIpv4AddressFromHextets(hextets: string[]): string | undefined {
    if (hextets.length !== 2) {
      return undefined;
    }

    const [high, low] = hextets.map((hextet) => parseInt(hextet, 16));

    if (
      !this.isValidMappedIpv4Hextet(high) ||
      !this.isValidMappedIpv4Hextet(low)
    ) {
      return undefined;
    }

    return [
      Math.floor(high / 256),
      high % 256,
      Math.floor(low / 256),
      low % 256,
    ].join('.');
  }

  private isValidMappedIpv4Hextet(hextet: number): boolean {
    return !Number.isNaN(hextet) && hextet >= 0 && hextet <= 0xffff;
  }

  private isBlockedIpv4(address: string): boolean {
    return PublicUrlGuard.BLOCKED_IPV4_RANGES.some(([base, prefixLength]) =>
      this.isIpv4InRange(address, base, prefixLength),
    );
  }

  private isUniqueLocalIpv6(address: string): boolean {
    return address.startsWith('fc') || address.startsWith('fd');
  }

  private isLinkLocalIpv6(address: string): boolean {
    return ['fe8', 'fe9', 'fea', 'feb'].some((prefix) =>
      address.startsWith(prefix),
    );
  }

  private isBlockedMappedIpv4(address: string): boolean {
    const mappedAddress = this.mappedIpv4Address(address);

    return mappedAddress !== undefined && this.isBlockedIpv4(mappedAddress);
  }

  private isBlockedIpv6(address: string): boolean {
    const normalized = this.normalizedAddress(address);

    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('ff') ||
      this.isUniqueLocalIpv6(normalized) ||
      this.isLinkLocalIpv6(normalized) ||
      this.isBlockedMappedIpv4(normalized)
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
      address: addresses[0].address,
      family: addresses[0].family as 4 | 6,
      url,
    };
  }
}
