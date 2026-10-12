import { PrivateBlobByteRange } from '@app/contexts/private-blobs/domain/PrivateBlobByteRange';
import { PrivateBlobRangeOutOfBoundsError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobRangeOutOfBoundsError';
import { PrivateBlobRangeRequest } from '@app/contexts/private-blobs/domain/PrivateBlobRangeRequest';

describe('PrivateBlobByteRange.resolve', () => {
  it('resolves a bounded window', () => {
    expect(
      PrivateBlobByteRange.resolve({ first: 2, kind: 'from', last: 4 }, 10),
    ).toEqual({ end: 4, start: 2 });
  });

  it('clamps a bounded window that ends past the blob', () => {
    expect(
      PrivateBlobByteRange.resolve({ first: 8, kind: 'from', last: 99 }, 10),
    ).toEqual({ end: 9, start: 8 });
  });

  it('resolves an open-ended window to the last byte', () => {
    expect(
      PrivateBlobByteRange.resolve({ first: 7, kind: 'from' }, 10),
    ).toEqual({ end: 9, start: 7 });
  });

  it('resolves a suffix window and clamps it to the start of the blob', () => {
    expect(
      PrivateBlobByteRange.resolve({ kind: 'suffix', length: 3 }, 10),
    ).toEqual({ end: 9, start: 7 });
    expect(
      PrivateBlobByteRange.resolve({ kind: 'suffix', length: 99 }, 10),
    ).toEqual({ end: 9, start: 0 });
  });

  it('reports the blob size when a window cannot be satisfied', () => {
    const error = captureError(() =>
      PrivateBlobByteRange.resolve({ first: 10, kind: 'from' }, 10),
    );

    expect(error).toBeInstanceOf(PrivateBlobRangeOutOfBoundsError);
    expect(error).toMatchObject({ size: 10 });
  });

  const unsatisfiable: [string, PrivateBlobRangeRequest, number][] = [
    [
      'a window starting at the end of the blob',
      { first: 10, kind: 'from' },
      10,
    ],
    [
      'a window whose last byte precedes its first',
      { first: 5, kind: 'from', last: 4 },
      10,
    ],
    ['an empty suffix', { kind: 'suffix', length: 0 }, 10],
    ['an invalid request', { kind: 'invalid' }, 10],
    ['any window on an empty blob', { first: 0, kind: 'from' }, 0],
  ];

  it.each(unsatisfiable)('rejects %s', (_, request, size) => {
    expect(() => PrivateBlobByteRange.resolve(request, size)).toThrow(
      PrivateBlobRangeOutOfBoundsError,
    );
  });
});

function captureError(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the attempt to throw.');
}
