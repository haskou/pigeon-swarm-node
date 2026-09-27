import { PrivateControlOperation } from '../../domain/PrivateControlOperation';

export abstract class PrivateOperationDecoder {
  public abstract decode(canonicalSignedJson: string): PrivateControlOperation;
}
