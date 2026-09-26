import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

describe('private authorization OpenAPI contract', () => {
  const specification = YAML.parse(
    fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/apps/apis/private-authorization-api/swagger.yaml',
      ),
      'utf8',
    ),
  );

  it('documents the required request bodies and response variants', () => {
    const challenge =
      specification.paths['/private-authorization/challenges'].post;
    const operation =
      specification.paths['/private-authorization/operations'].post;

    expect(challenge.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/PostPrivateAuthorizationChallengeBody',
          },
        },
      },
      required: true,
    });
    expect(operation.requestBody.required).toBe(true);
    expect(
      operation.responses['200'].content['application/json'].schema,
    ).toMatchObject({
      properties: { status: { enum: ['accepted', 'duplicate'] } },
    });
    expect(
      operation.responses['202'].content['application/json'].schema,
    ).toMatchObject({
      properties: { status: { enum: ['pending'] } },
    });
  });

  it('matches the validated DTO field limits', () => {
    const schemas = specification.components.schemas;

    expect(schemas.PostPrivateAuthorizationChallengeBody).toMatchObject({
      properties: {
        signedOperationJson: { maxLength: 262144, type: 'string' },
      },
      required: ['signedOperationJson'],
    });
    expect(schemas.PostPrivateAuthorizationOperationBody).toMatchObject({
      required: ['signedFreshnessProofJson', 'signedOperationJson'],
    });
    expect(schemas.PrivateControlFrameBody).toMatchObject({
      required: ['encryptedMlsState', 'mlsMessage', 'signedTransitionJson'],
    });
    expect(schemas.PrivateAuthorizationChallengeResource).toMatchObject({
      properties: { challenge: { type: 'string' } },
      required: ['challenge'],
    });
  });
});
