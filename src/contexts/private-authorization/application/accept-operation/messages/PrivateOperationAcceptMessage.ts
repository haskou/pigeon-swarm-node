import { PrivateControlFrame } from './PrivateControlFrame';

export class PrivateOperationAcceptMessage {
  public constructor(
    public readonly signedOperationJson: string,
    public readonly signedFreshnessProofJson: string,
    public readonly controlFrame?: PrivateControlFrame,
  ) {}
}
