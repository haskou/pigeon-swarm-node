import { ContentSignature } from './ContentSignature';
import { SniffedContentType } from './SniffedContentType';

const text = (value: string): number[] =>
  [...value].map((character) => character.charCodeAt(0));

const SIGNATURES: ContentSignature[] = [
  {
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    contentType: 'image/png',
  },
  { bytes: [0xff, 0xd8, 0xff], contentType: 'image/jpeg' },
  { bytes: text('GIF87a'), contentType: 'image/gif' },
  { bytes: text('GIF89a'), contentType: 'image/gif' },
  { bytes: text('%PDF-'), contentType: 'application/pdf' },
  { bytes: text('OggS'), contentType: 'audio/ogg' },
  { bytes: text('fLaC'), contentType: 'audio/flac' },
  { bytes: text('ID3'), contentType: 'audio/mpeg' },
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], contentType: 'video/webm' },
];

const BRANDS: Array<[string[], string]> = [
  [['avif', 'avis'], 'image/avif'],
  [['M4A ', 'M4B '], 'audio/mp4'],
  [['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', 'M4V '], 'video/mp4'],
];

const RIFF_FORMS: Record<string, string> = {
  WAVE: 'audio/wav',
  WEBP: 'image/webp',
};

/**
 * Chooses the media type of public bytes from their own magic bytes.
 * Replicated records do not carry a type (a peer could swap it for
 * `text/html`), so only an allowlist of passive media is ever served inline;
 * everything else is an opaque download.
 */
export class ContentTypeSniffer {
  public static readonly DOWNLOAD: SniffedContentType = {
    contentType: 'application/octet-stream',
    inline: false,
  };

  private static ascii(bytes: Uint8Array, start: number, end: number): string {
    return Buffer.from(bytes.subarray(start, end)).toString('latin1');
  }

  private static container(bytes: Uint8Array): string | undefined {
    const ascii = (start: number, end: number): string =>
      ContentTypeSniffer.ascii(bytes, start, end);

    if (ascii(0, 4) === 'RIFF') return RIFF_FORMS[ascii(8, 12)];

    if (ascii(4, 8) !== 'ftyp') return undefined;

    return BRANDS.find(([brands]) => brands.includes(ascii(8, 12)))?.[1];
  }

  private static signature(bytes: Uint8Array): string | undefined {
    return SIGNATURES.find((candidate) =>
      candidate.bytes.every((byte, index) => bytes[index] === byte),
    )?.contentType;
  }

  public static sniff(bytes: Uint8Array): SniffedContentType {
    const contentType =
      ContentTypeSniffer.signature(bytes) ??
      ContentTypeSniffer.container(bytes);

    return contentType
      ? { contentType, inline: true }
      : ContentTypeSniffer.DOWNLOAD;
  }
}
