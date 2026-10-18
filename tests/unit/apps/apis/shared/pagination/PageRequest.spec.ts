import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageRequest } from '@app/apps/apis/shared/pagination/PageRequest';

describe(PageRequest.name, () => {
  const resource = 'things';

  const parseDigits = (position: string): string => {
    if (!/^\d+$/.test(position)) {
      throw new Error('not a digit position');
    }

    return position;
  };

  it('reads the first page of 50 with no cursor', () => {
    const request = new PageRequest(
      resource,
      undefined,
      undefined,
      parseDigits,
    );

    expect(request.getLimit()).toBe(50);
    expect(request.getAfterPosition()).toBeUndefined();
  });

  it('reads after the position a cursor carries', () => {
    const cursor = PageCursor.encode({ position: '7', resource });

    expect(
      new PageRequest(resource, '10', cursor, parseDigits).getAfterPosition(),
    ).toBe('7');
  });

  it('refuses a cursor issued for another list', () => {
    const cursor = PageCursor.encode({ position: '7', resource: 'others' });

    expect(() =>
      new PageRequest(resource, undefined, cursor, parseDigits).getAfterPosition(),
    ).toThrow(InvalidPageCursorError);
  });

  it('refuses a cursor whose position the parser rejects', () => {
    const cursor = PageCursor.encode({ position: 'seven', resource });

    expect(() =>
      new PageRequest(resource, undefined, cursor, parseDigits).getAfterPosition(),
    ).toThrow(InvalidPageCursorError);
  });

  it.each([['not-a-cursor'], ['']])(
    'refuses the malformed cursor %p',
    (cursor) => {
      expect(() =>
        new PageRequest(resource, undefined, cursor, parseDigits).getAfterPosition(),
      ).toThrow(InvalidPageCursorError);
    },
  );

  it('issues no next cursor when the page is short', () => {
    const request = new PageRequest(
      resource,
      undefined,
      undefined,
      parseDigits,
    );

    expect(request.nextCursor(undefined)).toBeNull();
  });

  it('issues a next cursor that reads after the given position', () => {
    const request = new PageRequest(
      resource,
      undefined,
      undefined,
      parseDigits,
    );
    const next = request.nextCursor('7');

    expect(next).not.toBeNull();
    expect(
      new PageRequest(resource, undefined, next!, parseDigits).getAfterPosition(),
    ).toBe('7');
  });
});
