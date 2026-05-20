import { lookup } from 'dns/promises';
import net from 'net';

import { InvalidLinkPreviewUrlError } from '../errors/InvalidLinkPreviewUrlError';

export type ResolvedLinkPreviewUrl = {
  address: string;
  family: 4 | 6;
  url: URL;
};

export class LinkPreviewUrlGuard {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];

  private assertAllowedProtocol(url: URL): void {
    if (!LinkPreviewUrlGuard.ALLOWED_PROTOCOLS.includes(url.protocol)) {
      throw new InvalidLinkPreviewUrlError(
        'Only http and https URLs can be previewed.',
      );
    }
  }

  private assertAllowedHostname(url: URL): void {
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.length === 0
    ) {
      throw new InvalidLinkPreviewUrlError(
        'Localhost URLs cannot be previewed.',
      );
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
    return (
      this.isIpv4InRange(address, '127.0.0.0', 8) ||
      this.isIpv4InRange(address, '10.0.0.0', 8) ||
      this.isIpv4InRange(address, '172.16.0.0', 12) ||
      this.isIpv4InRange(address, '192.168.0.0', 16) ||
      this.isIpv4InRange(address, '169.254.0.0', 16) ||
      this.isIpv4InRange(address, '0.0.0.0', 8)
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
      this.isUniqueLocalIpv6(normalized) ||
      this.isLinkLocalIpv6(normalized) ||
      this.isBlockedMappedIpv4(normalized)
    );
  }

  private assertAllowedAddress(address: string): void {
    const normalized = this.normalizedAddress(address);
    const family = net.isIP(normalized);

    if (family === 4 && this.isBlockedIpv4(normalized)) {
      throw new InvalidLinkPreviewUrlError(
        'Private IP addresses cannot be previewed.',
      );
    }

    if (family === 6 && this.isBlockedIpv6(normalized)) {
      throw new InvalidLinkPreviewUrlError(
        'Private IP addresses cannot be previewed.',
      );
    }
  }

  public parse(rawUrl: string): URL {
    let url: URL;

    try {
      url = new URL(rawUrl);
    } catch (error: unknown) {
      throw new InvalidLinkPreviewUrlError();
    }

    this.assertAllowedProtocol(url);
    this.assertAllowedHostname(url);

    if (net.isIP(this.normalizedAddress(url.hostname))) {
      this.assertAllowedAddress(url.hostname);
    }

    return url;
  }

  public async resolve(rawUrl: string | URL): Promise<ResolvedLinkPreviewUrl> {
    const url =
      typeof rawUrl === 'string'
        ? this.parse(rawUrl)
        : this.parse(rawUrl.toString());
    const addresses = await lookup(url.hostname, {
      all: true,
      verbatim: true,
    });

    if (addresses.length === 0) {
      throw new InvalidLinkPreviewUrlError(
        'URL hostname could not be resolved.',
      );
    }

    addresses.forEach((address) => this.assertAllowedAddress(address.address));

    return {
      address: addresses[0].address,
      family: addresses[0].family as 4 | 6,
      url,
    };
  }
}
