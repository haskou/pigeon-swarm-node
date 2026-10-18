import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';

describe('PageCursor', () => {
  const binding = { caller: 'identity-1', resource: 'list-a' };

  it('round-trips the position for the same resource and caller', () => {
    const cursor = PageCursor.encode({ ...binding, position: 'message-9' });

    expect(PageCursor.decode(cursor, binding)).toEqual('message-9');
  });

  it('refuses a cursor issued for another resource', () => {
    const cursor = PageCursor.encode({ ...binding, position: 'message-9' });

    expect(() =>
      PageCursor.decode(cursor, { ...binding, resource: 'list-b' }),
    ).toThrow(InvalidPageCursorError);
  });

  it('refuses a cursor issued to another caller', () => {
    const cursor = PageCursor.encode({ ...binding, position: 'message-9' });

    expect(() =>
      PageCursor.decode(cursor, { ...binding, caller: 'identity-2' }),
    ).toThrow(InvalidPageCursorError);
  });

  it.each(['', '%%%', Buffer.from('[]').toString('base64url')])(
    'refuses a malformed cursor %p',
    (value) => {
      expect(() => PageCursor.decode(value, binding)).toThrow(
        InvalidPageCursorError,
      );
    },
  );
});
