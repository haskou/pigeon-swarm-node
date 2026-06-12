import type { ParsedCidLike } from './adapters/HeliaRuntimeAdapter';

export default class IPFSCidCodec {
  private static readonly RAW_CODEC_CODE = 0x55;

  public static isRaw(parsedCid: ParsedCidLike): boolean {
    return parsedCid.code === IPFSCidCodec.RAW_CODEC_CODE;
  }
}
