import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';

import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceSealedSecretNotFoundError } from './errors/DeviceSealedSecretNotFoundError';
import { DeviceSealedSecretPublisherNotAuthorizedError } from './errors/DeviceSealedSecretPublisherNotAuthorizedError';
import { DeviceSealedSecretRecipientsMismatchError } from './errors/DeviceSealedSecretRecipientsMismatchError';
import { DeviceSealedSecretRevisionMismatchError } from './errors/DeviceSealedSecretRevisionMismatchError';
import { InvalidDeviceSealedSecretBundleError } from './errors/InvalidDeviceSealedSecretBundleError';
import { InvalidDeviceSealedSecretSignatureError } from './errors/InvalidDeviceSealedSecretSignatureError';

export interface DeviceSealedSecretEntryPrimitives {
  recipientCredential: string;
  sealedSecret: string;
  signature: string;
}

export interface DeviceSealedSecretBundlePrimitives {
  identityId: string;
  publisherCredential: string;
  authorizationRevision: number;
  generation: number;
  entries: DeviceSealedSecretEntryPrimitives[];
}

export interface DeviceSealedSecretDeliveryPrimitives extends DeviceSealedSecretEntryPrimitives {
  identityId: string;
  publisherCredential: string;
  authorizationRevision: number;
  generation: number;
}

export interface DeviceSealedSecretSigningInput {
  authorizationRevision: number;
  generation: number;
  identityId: string;
  publisherCredential: string;
  recipientCredential: string;
  sealedSecret: string;
}

const SIGNING_PURPOSE = 'pigeon:device-sealed-secret:v1';
const MAX_ENTRIES = 128;
const SEALED_SECRET_PATTERN = /^[A-Za-z0-9+/=.-]+$/;

function parseCredential(value: string, reason: string): IdentityId {
  try {
    return new IdentityId(value);
  } catch {
    throw new InvalidDeviceSealedSecretBundleError(reason);
  }
}

export class DeviceSealedSecretBundle {
  public static readonly MAX_SEALED_SECRET_LENGTH = 4096;

  public static fromPrimitives(
    primitives: DeviceSealedSecretBundlePrimitives,
  ): DeviceSealedSecretBundle {
    if (!Number.isInteger(primitives.generation) || primitives.generation < 1) {
      throw new InvalidDeviceSealedSecretBundleError(
        'generation must be a positive integer',
      );
    }

    if (
      !Number.isSafeInteger(primitives.authorizationRevision) ||
      primitives.authorizationRevision < 0
    ) {
      throw new InvalidDeviceSealedSecretBundleError(
        'authorization revision must be a non-negative integer',
      );
    }

    if (
      primitives.entries.length < 1 ||
      primitives.entries.length > MAX_ENTRIES
    ) {
      throw new InvalidDeviceSealedSecretBundleError(
        `entries must hold between 1 and ${MAX_ENTRIES} recipients`,
      );
    }

    const recipients = new Set<string>();
    const entries = primitives.entries.map((entry) => {
      const recipientCredential = parseCredential(
        entry.recipientCredential,
        'recipient credential is malformed',
      ).valueOf();

      if (recipients.has(recipientCredential)) {
        throw new InvalidDeviceSealedSecretBundleError(
          'recipient credentials must be unique',
        );
      }

      recipients.add(recipientCredential);

      if (
        entry.sealedSecret.length < 1 ||
        entry.sealedSecret.length >
          DeviceSealedSecretBundle.MAX_SEALED_SECRET_LENGTH ||
        !SEALED_SECRET_PATTERN.test(entry.sealedSecret)
      ) {
        throw new InvalidDeviceSealedSecretBundleError(
          'sealed secret is malformed',
        );
      }

      if (entry.signature.length === 0) {
        throw new InvalidDeviceSealedSecretBundleError(
          'signature must not be empty',
        );
      }

      return {
        recipientCredential,
        sealedSecret: entry.sealedSecret,
        signature: entry.signature,
      };
    });

    return new DeviceSealedSecretBundle(
      parseCredential(primitives.identityId, 'identity id is malformed'),
      parseCredential(
        primitives.publisherCredential,
        'publisher credential is malformed',
      ).valueOf(),
      primitives.authorizationRevision,
      primitives.generation,
      entries,
    );
  }

  public static signingPayload(input: DeviceSealedSecretSigningInput): string {
    return JSON.stringify({
      authorizationRevision: input.authorizationRevision,
      generation: input.generation,
      identityId: input.identityId,
      publisherCredential: input.publisherCredential,
      purpose: SIGNING_PURPOSE,
      recipientCredential: input.recipientCredential,
      sealedSecret: input.sealedSecret,
    });
  }

  private constructor(
    private readonly identityId: IdentityId,
    private readonly publisherCredential: string,
    private readonly authorizationRevision: number,
    private readonly generation: number,
    private readonly entries: readonly DeviceSealedSecretEntryPrimitives[],
  ) {}

  private hasValidSignature(
    publisher: DeviceCredential,
    entry: DeviceSealedSecretEntryPrimitives,
  ): boolean {
    try {
      return publisher.isValidSignature(
        DeviceSealedSecretBundle.signingPayload({
          authorizationRevision: this.authorizationRevision,
          generation: this.generation,
          identityId: this.identityId.valueOf(),
          publisherCredential: this.publisherCredential,
          recipientCredential: entry.recipientCredential,
          sealedSecret: entry.sealedSecret,
        }),
        new Signature(entry.signature),
      );
    } catch {
      return false;
    }
  }

  public assertPublishableBy(authorization: DeviceAuthorization): void {
    if (!this.identityId.isEqual(authorization.getIdentityId())) {
      throw new InvalidDeviceSealedSecretBundleError(
        'bundle is addressed to another identity',
      );
    }

    if (this.authorizationRevision !== authorization.getRevision().valueOf()) {
      throw new DeviceSealedSecretRevisionMismatchError();
    }

    const publisher = DeviceCredential.fromIdentityId(
      new IdentityId(this.publisherCredential),
    );

    if (!authorization.isAuthorized(publisher)) {
      throw new DeviceSealedSecretPublisherNotAuthorizedError();
    }

    const authorized = new Set(
      authorization
        .getCredentials()
        .map((credential) => new IdentityId(credential.valueOf()).valueOf()),
    );
    const recipients = this.entries.map((entry) => entry.recipientCredential);

    if (
      authorized.size !== recipients.length ||
      recipients.some((recipient) => !authorized.has(recipient))
    ) {
      throw new DeviceSealedSecretRecipientsMismatchError();
    }

    for (const entry of this.entries) {
      if (!this.hasValidSignature(publisher, entry)) {
        throw new InvalidDeviceSealedSecretSignatureError();
      }
    }
  }

  public deliveryFor(
    recipientCredential: string,
  ): DeviceSealedSecretDeliveryPrimitives {
    const entry = this.entries.find(
      (candidate) => candidate.recipientCredential === recipientCredential,
    );

    if (!entry) {
      throw new DeviceSealedSecretNotFoundError();
    }

    return {
      authorizationRevision: this.authorizationRevision,
      generation: this.generation,
      identityId: this.identityId.valueOf(),
      publisherCredential: this.publisherCredential,
      ...entry,
    };
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getGeneration(): number {
    return this.generation;
  }

  public getAuthorizationRevision(): number {
    return this.authorizationRevision;
  }

  public toPrimitives(): DeviceSealedSecretBundlePrimitives {
    return {
      authorizationRevision: this.authorizationRevision,
      entries: this.entries.map((entry) => ({ ...entry })),
      generation: this.generation,
      identityId: this.identityId.valueOf(),
      publisherCredential: this.publisherCredential,
    };
  }
}
