import { InvalidIdentityMailboxHomeError } from '@app/contexts/identities/domain/errors/InvalidIdentityMailboxHomeError';
import { IdentityMailboxHome } from '@app/contexts/identities/domain/value-objects/IdentityMailboxHome';

describe('IdentityMailboxHome', () => {
  it.each([
    'https://node.example',
    'https://node.example:8443',
    'http://localhost:3000',
    'https://node.example/api',
    'https://node.example:8443/pigeon/api',
  ])('should accept the base URL %s', (baseUrl) => {
    expect(new IdentityMailboxHome(baseUrl).valueOf()).toBe(baseUrl);
  });

  it.each([
    ['an empty string', ''],
    ['a bare host', 'node.example'],
    ['an unsupported scheme', 'ftp://node.example'],
    ['a trailing slash on the origin', 'https://node.example/'],
    ['a trailing slash on a path', 'https://node.example/api/'],
    ['a dot segment', 'https://node.example/api/../admin'],
    ['an empty path segment', 'https://node.example//api'],
    ['an uppercase host', 'https://NODE.example'],
    ['a default port', 'https://node.example:443'],
    ['a query', 'https://node.example/api?x=1'],
    ['an empty query', 'https://node.example/api?'],
    ['a fragment', 'https://node.example/api#x'],
    ['user information', 'https://user:secret@node.example/api'],
    ['surrounding whitespace', ' https://node.example'],
    ['a value over the length bound', `https://${'a'.repeat(250)}.example`],
  ])('should reject %s', (_description, value) => {
    expect(() => new IdentityMailboxHome(value)).toThrow(
      InvalidIdentityMailboxHomeError,
    );
  });
});
