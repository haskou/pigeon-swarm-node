import { PrivateBlobRangeHeader } from '@app/apps/apis/private-blobs-api/headers/PrivateBlobRangeHeader';

describe('PrivateBlobRangeHeader.parse', () => {
  it('returns undefined when no Range header is sent', () => {
    expect(PrivateBlobRangeHeader.parse(undefined)).toBeUndefined();
  });

  it('parses bounded, open-ended and suffix byte ranges', () => {
    expect(PrivateBlobRangeHeader.parse('bytes=2-4')).toEqual({
      first: 2,
      kind: 'from',
      last: 4,
    });
    expect(PrivateBlobRangeHeader.parse('bytes=10-')).toEqual({
      first: 10,
      kind: 'from',
    });
    expect(PrivateBlobRangeHeader.parse('bytes=-3')).toEqual({
      kind: 'suffix',
      length: 3,
    });
  });

  it('tolerates surrounding whitespace', () => {
    expect(PrivateBlobRangeHeader.parse('  bytes=2-4 ')).toEqual({
      first: 2,
      kind: 'from',
      last: 4,
    });
  });

  it.each([
    ['another unit', 'items=0-1'],
    ['multiple ranges', 'bytes=0-1,3-4'],
    ['no bounds', 'bytes=-'],
    ['non-numeric bounds', 'bytes=a-b'],
    ['an empty value', ''],
  ])('maps %s to an invalid request', (_, header) => {
    expect(PrivateBlobRangeHeader.parse(header)).toEqual({ kind: 'invalid' });
  });
});
