import { InvalidIdentityMailboxHomeError } from '@app/contexts/identities/domain/errors/InvalidIdentityMailboxHomeError';
import { IdentityMailboxHome } from '@app/contexts/identities/domain/value-objects/IdentityMailboxHome';

describe('IdentityMailboxHome', () => {
  it.each([
    'https://node.example',
    'https://node.example:8443',
    'http://localhost:3000',
  ])('should accept the origin %s', (origin) => {
    expect(new IdentityMailboxHome(origin).valueOf()).toBe(origin);
  });

  it.each([
    ['an empty string', ''],
    ['a bare host', 'node.example'],
    ['an unsupported scheme', 'ftp://node.example'],
    ['a trailing slash', 'https://node.example/'],
    ['a path', 'https://node.example/api'],
    ['a query', 'https://node.example?x=1'],
    ['a fragment', 'https://node.example#x'],
    ['user information', 'https://user:secret@node.example'],
    ['surrounding whitespace', ' https://node.example'],
    ['a value over the length bound', `https://${'a'.repeat(250)}.example`],
  ])('should reject %s', (_description, value) => {
    expect(() => new IdentityMailboxHome(value)).toThrow(
      InvalidIdentityMailboxHomeError,
    );
  });
});
