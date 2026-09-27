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

  it('documents signed request authentication for every operation', () => {
    const expectedParameters = [
      { $ref: '#/components/parameters/XIdentityId' },
      { $ref: '#/components/parameters/XTimestamp' },
      { $ref: '#/components/parameters/XSignature' },
    ];

    for (const path of Object.values(specification.paths) as Array<{
      post: { parameters: unknown; responses: Record<string, unknown> };
    }>) {
      expect(path.post.parameters).toEqual(expectedParameters);
      expect(path.post.responses['401']).toEqual({
        description: 'Invalid signed request',
      });
    }
  });

  it('matches the validated DTO field limits', () => {
    const schemas = specification.components.schemas;

    expect(schemas.PostPrivateAuthorizationChallengeBody).toMatchObject({
      properties: {
        controlFrame: { $ref: '#/components/schemas/PrivateControlFrameBody' },
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
