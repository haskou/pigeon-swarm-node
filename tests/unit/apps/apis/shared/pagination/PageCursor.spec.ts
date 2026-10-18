import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';

describe('PageCursor', () => {
  const resource = 'list-a';

  it('round-trips the position for the same resource', () => {
    const cursor = PageCursor.encode({ position: 'message-9', resource });

    expect(PageCursor.decode(cursor, resource)).toEqual('message-9');
  });

  it('carries only the position and resource, never a caller', () => {
    const payload = JSON.parse(
      Buffer.from(
        PageCursor.encode({ position: 'message-9', resource }),
        'base64url',
      ).toString('utf8'),
    ) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(['position', 'resource']);
  });

  it('refuses a cursor issued for another resource', () => {
    const cursor = PageCursor.encode({ position: 'message-9', resource });

    expect(() => PageCursor.decode(cursor, 'list-b')).toThrow(
      InvalidPageCursorError,
    );
  });

  it('round-trips a position of exactly 256 characters', () => {
    const position = 'p'.repeat(256);
    const cursor = PageCursor.encode({ position, resource });

    expect(PageCursor.decode(cursor, resource)).toEqual(position);
  });

  it('refuses a position longer than 256 characters', () => {
    const cursor = Buffer.from(
      JSON.stringify({ position: 'p'.repeat(257), resource }),
    ).toString('base64url');

    expect(() => PageCursor.decode(cursor, resource)).toThrow(
      InvalidPageCursorError,
    );
  });

  it.each([
    '',
    '%%%',
    Buffer.from('[]').toString('base64url'),
    Buffer.from('{"position":"m","resource":"list-a","extra":1}').toString(
      'base64url',
    ),
    Buffer.from('{"position":"","resource":"list-a"}').toString('base64url'),
    Buffer.from('{"position":1,"resource":"list-a"}').toString('base64url'),
    Buffer.from('{"position":"m"}').toString('base64url'),
    `${Buffer.from('{"position":"m","resource":"list-a"}').toString('base64url')}=`,
    Buffer.from('{"resource":"list-a","position":"m"}').toString('base64url'),
    'a'.repeat(513),
  ])('refuses a malformed cursor %p', (value) => {
    expect(() => PageCursor.decode(value, resource)).toThrow(
      InvalidPageCursorError,
    );
  });
});
