import { ContentTypeSniffer } from '@app/contexts/content-replication/domain/services/ContentTypeSniffer';

const bytes = (...values: number[]): Buffer => Buffer.from(values);
const ascii = (value: string): number[] => [...Buffer.from(value, 'latin1')];

describe('ContentTypeSniffer', () => {
  it.each([
    ['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/gif', Buffer.from('GIF89a....')],
    ['application/pdf', Buffer.from('%PDF-1.7')],
    [
      'image/webp',
      bytes(...ascii('RIFF'), 1, 0, 0, 0, ...ascii('WEBP')),
    ],
    ['audio/wav', bytes(...ascii('RIFF'), 1, 0, 0, 0, ...ascii('WAVE'))],
    ['image/avif', bytes(0, 0, 0, 0x1c, ...ascii('ftypavif'))],
    ['video/mp4', bytes(0, 0, 0, 0x1c, ...ascii('ftypisom'))],
  ])('serves %s inline', (contentType, content) => {
    expect(ContentTypeSniffer.sniff(content)).toEqual({
      contentType,
      inline: true,
    });
  });

  it.each([
    ['html', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['empty', Buffer.alloc(0)],
    ['polyglot text', Buffer.from('GIF8 not really')],
  ])('serves %s as an attachment of opaque bytes', (_name, content) => {
    expect(ContentTypeSniffer.sniff(content)).toEqual({
      contentType: 'application/octet-stream',
      inline: false,
    });
  });
});
