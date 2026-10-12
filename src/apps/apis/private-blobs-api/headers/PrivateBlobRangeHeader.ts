import { PrivateBlobRangeRequest } from '@app/contexts/private-blobs/domain/PrivateBlobRangeRequest';

/**
 * Parses the HTTP `Range` header into a domain request. Only the single
 * `bytes=` form is supported; any other syntax is an unsatisfiable request.
 */
export class PrivateBlobRangeHeader {
  private static readonly PATTERN = /^bytes=(\d*)-(\d*)$/;

  public static parse(
    header: string | undefined,
  ): PrivateBlobRangeRequest | undefined {
    if (header === undefined) {
      return undefined;
    }

    const match = PrivateBlobRangeHeader.PATTERN.exec(header.trim());

    if (!match || (match[1] === '' && match[2] === '')) {
      return { kind: 'invalid' };
    }

    if (match[1] === '') {
      return { kind: 'suffix', length: Number(match[2]) };
    }

    return {
      first: Number(match[1]),
      kind: 'from',
      last: match[2] === '' ? undefined : Number(match[2]),
    };
  }
}
