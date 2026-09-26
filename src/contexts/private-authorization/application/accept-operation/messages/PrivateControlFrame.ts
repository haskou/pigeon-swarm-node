export interface PrivateControlFrame {
  encryptedMlsState: string;
  mlsMessage: string;
  signedTransitionJson: string;
}
