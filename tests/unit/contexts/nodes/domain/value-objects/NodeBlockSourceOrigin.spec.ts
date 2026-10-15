import { InvalidNodeBlockSourceOriginError } from '@app/contexts/nodes/domain/errors/InvalidNodeBlockSourceOriginError';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';

describe('NodeBlockSourceOrigin', () => {
  it('should keep a bare https origin in normalised form', () => {
    const origin = new NodeBlockSourceOrigin('https://Node.Example:8443/');

    expect(origin.valueOf()).toBe('https://node.example:8443');
    expect(origin.publishedListUrl().toString()).toBe(
      'https://node.example:8443/node/blocks/published',
    );
  });

  it.each([
    'http://node.example',
    'ftp://node.example',
    'https://user:secret@node.example',
    'https://node.example/node/blocks/published',
    'https://node.example/?a=1',
    'https://node.example/#x',
    'https://node.example?',
    'not a url',
    '',
  ])('should refuse %p', (value) => {
    expect(() => new NodeBlockSourceOrigin(value)).toThrow(
      InvalidNodeBlockSourceOriginError,
    );
  });
});
