import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { UniqueObjectArray } from '@haskou/value-objects';

import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceAuthorizationTransition } from './DeviceAuthorizationTransition';
import { DeviceSealedSecretEntry } from './DeviceSealedSecretEntry';
import { DeviceSealedSecretGenerationStaleError } from './errors/DeviceSealedSecretGenerationStaleError';
import { DeviceSealedSecretNotFoundError } from './errors/DeviceSealedSecretNotFoundError';
import { DeviceSealedSecretPublisherNotAuthorizedError } from './errors/DeviceSealedSecretPublisherNotAuthorizedError';
import { DeviceSealedSecretRecipientsMismatchError } from './errors/DeviceSealedSecretRecipientsMismatchError';
import { DeviceSealedSecretRevisionMismatchError } from './errors/DeviceSealedSecretRevisionMismatchError';
import { InvalidDeviceSealedSecretBundleError } from './errors/InvalidDeviceSealedSecretBundleError';
import { InvalidDeviceSealedSecretSignatureError } from './errors/InvalidDeviceSealedSecretSignatureError';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';
import { DeviceSealedSecretGeneration } from './value-objects/DeviceSealedSecretGeneration';

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

function parseOrReject<T>(reason: string, parse: () => T): T {
  try {
    return parse();
  } catch {
    throw new InvalidDeviceSealedSecretBundleError(reason);
  }
}

export class DeviceSealedSecretBundle {
  public static readonly MAX_SEALED_SECRET_LENGTH = 4096;

  public static fromPrimitives(
    primitives: DeviceSealedSecretBundlePrimitives,
  ): DeviceSealedSecretBundle {
    const generation = parseOrReject(
      'generation must be a positive integer',
      () => new DeviceSealedSecretGeneration(primitives.generation),
    );
    const authorizationRevision = parseOrReject(
      'authorization revision must be a non-negative integer',
      () => new DeviceAuthorizationRevision(primitives.authorizationRevision),
    );

    if (
      primitives.entries.length < 1 ||
      primitives.entries.length > MAX_ENTRIES
    ) {
      throw new InvalidDeviceSealedSecretBundleError(
        `entries must hold between 1 and ${MAX_ENTRIES} recipients`,
      );
    }

    const entries = primitives.entries.map((entry) => {
      const recipientCredential = parseOrReject(
        'recipient credential is malformed',
        () => DeviceCredential.fromWire(entry.recipientCredential),
      );

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

    if (
      UniqueObjectArray.fromArray(
        entries.map((entry) => entry.recipientCredential),
      ).length !== entries.length
    ) {
      throw new InvalidDeviceSealedSecretBundleError(
        'recipient credentials must be unique',
      );
    }

    return new DeviceSealedSecretBundle(
      parseOrReject(
        'identity id is malformed',
        () => new IdentityId(primitives.identityId),
      ),
      parseOrReject('publisher credential is malformed', () =>
        DeviceCredential.fromWire(primitives.publisherCredential),
      ),
      authorizationRevision,
      generation,
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
    private readonly publisherCredential: DeviceCredential,
    private readonly authorizationRevision: DeviceAuthorizationRevision,
    private readonly generation: DeviceSealedSecretGeneration,
    private readonly entries: readonly DeviceSealedSecretEntry[],
  ) {}

  private hasValidSignature(entry: DeviceSealedSecretEntry): boolean {
    try {
      return this.publisherCredential.isValidSignature(
        DeviceSealedSecretBundle.signingPayload({
          authorizationRevision: this.authorizationRevision.valueOf(),
          generation: this.generation.valueOf(),
          identityId: this.identityId.valueOf(),
          publisherCredential: this.publisherCredential.toWire(),
          recipientCredential: entry.recipientCredential.toWire(),
          sealedSecret: entry.sealedSecret,
        }),
        new Signature(entry.signature),
      );
    } catch {
      return false;
    }
  }

  private assertBuiltFor(authorization: DeviceAuthorization): void {
    if (!this.identityId.isEqual(authorization.getIdentityId())) {
      throw new InvalidDeviceSealedSecretBundleError(
        'bundle is addressed to another identity',
      );
    }

    if (!authorization.getRevision().isEqual(this.authorizationRevision)) {
      throw new DeviceSealedSecretRevisionMismatchError();
    }
  }

  private assertSealedFor(authorization: DeviceAuthorization): void {
    if (!this.hasRecipients(authorization)) {
      throw new DeviceSealedSecretRecipientsMismatchError();
    }

    for (const entry of this.entries) {
      if (!this.hasValidSignature(entry)) {
        throw new InvalidDeviceSealedSecretSignatureError();
      }
    }
  }

  private hasRecipients(authorization: DeviceAuthorization): boolean {
    const authorized = UniqueObjectArray.fromArray(
      authorization.getCredentials(),
    );
    const recipients = this.entries.map((entry) => entry.recipientCredential);

    return (
      authorized.length === recipients.length &&
      recipients.every((recipient) => authorized.includes(recipient))
    );
  }

  private isRetirementOfPublisher(
    retirement: DeviceAuthorizationTransition,
  ): boolean {
    return (
      retirement.isRevocation() &&
      retirement.getIdentityId().isEqual(this.identityId) &&
      retirement.getCompromisedSince() === undefined &&
      retirement.getCompromisedCredentials().length === 0 &&
      retirement.getAuthorCredential().isEqual(this.publisherCredential) &&
      retirement.getTargetCredential().isEqual(this.publisherCredential)
    );
  }

  public assertPublishableBy(authorization: DeviceAuthorization): void {
    this.assertBuiltFor(authorization);

    if (!authorization.isAuthorized(this.publisherCredential)) {
      throw new DeviceSealedSecretPublisherNotAuthorizedError();
    }

    this.assertSealedFor(authorization);
  }

  /**
   * A hand-over is published by a device that retires itself: it seals a fresh
   * generation to the devices that remain once its own revocation applies.
   */
  public assertHandedOverBy(
    retirement: DeviceAuthorizationTransition,
    authorization: DeviceAuthorization,
  ): void {
    if (!this.isRetirementOfPublisher(retirement)) {
      throw new InvalidDeviceSealedSecretBundleError(
        'only a device retiring itself hands over sealed secrets',
      );
    }

    if (!authorization.isAuthorized(this.publisherCredential)) {
      throw new DeviceSealedSecretPublisherNotAuthorizedError();
    }

    const remaining = authorization.revoke(this.publisherCredential);

    this.assertBuiltFor(remaining);
    this.assertSealedFor(remaining);
  }

  public isAddressedTo(authorization: DeviceAuthorization): boolean {
    return (
      this.identityId.isEqual(authorization.getIdentityId()) &&
      authorization.getRevision().isEqual(this.authorizationRevision) &&
      this.hasRecipients(authorization)
    );
  }

  public assertSupersedes(stored: DeviceSealedSecretBundle | undefined): void {
    if (stored && stored.generation.isGreaterOrEqualThan(this.generation)) {
      throw new DeviceSealedSecretGenerationStaleError();
    }
  }

  public deliveryFor(
    recipientCredential: DeviceCredential,
  ): DeviceSealedSecretDeliveryPrimitives {
    const entry = this.entries.find((candidate) =>
      candidate.recipientCredential.isEqual(recipientCredential),
    );

    if (!entry) {
      throw new DeviceSealedSecretNotFoundError();
    }

    return {
      authorizationRevision: this.authorizationRevision.valueOf(),
      generation: this.generation.valueOf(),
      identityId: this.identityId.valueOf(),
      publisherCredential: this.publisherCredential.toWire(),
      recipientCredential: entry.recipientCredential.toWire(),
      sealedSecret: entry.sealedSecret,
      signature: entry.signature,
    };
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getGeneration(): DeviceSealedSecretGeneration {
    return this.generation;
  }

  public getAuthorizationRevision(): DeviceAuthorizationRevision {
    return this.authorizationRevision;
  }

  public toPrimitives(): DeviceSealedSecretBundlePrimitives {
    return {
      authorizationRevision: this.authorizationRevision.valueOf(),
      entries: this.entries.map((entry) => ({
        recipientCredential: entry.recipientCredential.toWire(),
        sealedSecret: entry.sealedSecret,
        signature: entry.signature,
      })),
      generation: this.generation.valueOf(),
      identityId: this.identityId.valueOf(),
      publisherCredential: this.publisherCredential.toWire(),
    };
  }
}
