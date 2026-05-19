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

  private normalizedIpv6(address: string): string {
    return address.toLowerCase();
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
    return (
      address.startsWith('::ffff:') &&
      this.isBlockedIpv4(address.replace('::ffff:', ''))
    );
  }

  private isBlockedIpv6(address: string): boolean {
    const normalized = this.normalizedIpv6(address);

    return (
      normalized === '::1' ||
      this.isUniqueLocalIpv6(normalized) ||
      this.isLinkLocalIpv6(normalized) ||
      this.isBlockedMappedIpv4(normalized)
    );
  }

  private assertAllowedAddress(address: string): void {
    const family = net.isIP(address);

    if (family === 4 && this.isBlockedIpv4(address)) {
      throw new InvalidLinkPreviewUrlError(
        'Private IP addresses cannot be previewed.',
      );
    }

    if (family === 6 && this.isBlockedIpv6(address)) {
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

    if (net.isIP(url.hostname)) {
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
