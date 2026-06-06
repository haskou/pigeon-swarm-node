import { PrimitiveOf } from '@haskou/value-objects';

import { Identity } from '../../Identity';

export type IdentitySignaturePayload = Omit<PrimitiveOf<Identity>, 'signature'>;
