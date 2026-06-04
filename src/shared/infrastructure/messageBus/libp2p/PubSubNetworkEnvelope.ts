import { ClearEnvelope } from './ClearEnvelope';
import { EncryptedEnvelope } from './EncryptedEnvelope';

export type PubSubNetworkEnvelope = ClearEnvelope | EncryptedEnvelope;
