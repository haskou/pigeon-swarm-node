import { isIP } from 'net';

const IPV6_PREFIX_GROUPS = 4;
const IPV4_MAPPED_GROUP = 0xffff;

/** Eight 16-bit groups, with `::` expanded and a dotted IPv4 tail converted. */
function ipv6Groups(address: string): number[] {
  const hexTail = address.replace(
    /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
    (_match: string, a: string, b: string, c: string, d: string) =>
      [Number(a) * 256 + Number(b), Number(c) * 256 + Number(d)]
        .map((hextet) => hextet.toString(16))
        .join(':'),
  );
  const sides = hexTail.split('::');
  const head = sides[0] ? sides[0].split(':') : [];
  const tail = sides[1] ? sides[1].split(':') : [];
  const zeros = Array<string>(
    sides.length > 1 ? 8 - head.length - tail.length : 0,
  ).fill('0');

  return [...head, ...zeros, ...tail].map((group) => parseInt(group, 16));
}

/**
 * Limit key for a client address. IPv4-mapped IPv6 counts as its IPv4 address,
 * and other IPv6 counts per /64, which one customer typically holds. Anything
 * that is not an IPv6 literal is returned unchanged.
 */
export default function clientRateKey(address: string): string {
  const literal = address.replace(/%.*$/, '');

  if (isIP(literal) !== 6) {
    return address;
  }

  const groups = ipv6Groups(literal);
  const mapped =
    groups[5] === IPV4_MAPPED_GROUP &&
    groups.slice(0, 5).every((group) => group === 0);

  if (mapped) {
    return [
      Math.floor(groups[6] / 256),
      groups[6] % 256,
      Math.floor(groups[7] / 256),
      groups[7] % 256,
    ].join('.');
  }

  const prefix = groups
    .slice(0, IPV6_PREFIX_GROUPS)
    .map((group) => group.toString(16));

  return `${prefix.join(':')}::/64`;
}
