Feature: Post identity route
  As an API consumer
  I want to publish a signed identity
  So that I can use it in the system

  Scenario: Reject backend-generated identity creation with a password
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set json body
      """
      {
        "name": "alice",
        "handle": "alice",
        "password": "Super-secret-password1!",
        "networks": [
          "123e4567-e89b-12d3-a456-426614174000"
        ]
      }
      """
    When I POST to "/identities/"
    Then response code is equal to 400

  Scenario: Publish a client-signed identity without sending a password
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "bob" and handle "bob"
    When I POST to "/identities/"
    Then response code is equal to 200
	    And response contains a valid resource with the following fields
	      | profile.name   | bob                                  |
	      | profile.handle | bob                                  |
	      | networks[0]    | 123e4567-e89b-12d3-a456-426614174000 |
	    And response body should contain "deviceCredentialCommitment"
	    And response body should contain "deviceCredential"
	    And response body should contain "recoveryAuthority"
	    And response body should contain "authorizationRevision"
	    And response body should not contain "encryptedPrivateKey"
	    And response body should not contain "encryptedMasterKey"
	    And response body should not contain "masterKeyDerivation"
	    And response body should contain "identityExternalIdentifier"
    And it has been pinned in ipfs
    When I GET "/identities/bob"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | profile.name   | bob |
      | profile.handle | bob |
    And response body should contain "identityExternalIdentifier"

  Scenario: Reject unlock material on a signed identity
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "unlock" and handle "unlock"
    And I add identity unlock fields
    When I POST to "/identities/"
    Then response code is equal to 400

  Scenario: Reject an undeclared secret on a signed identity
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "secret" and handle "secret"
    And I add undeclared identity field "recoverySecret"
    When I POST to "/identities/"
    Then response code is equal to 400

  Scenario: Reject an undeclared nested profile secret on a signed identity
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "nested secret" and handle "nested-secret"
    And I add undeclared identity profile field "recoverySecret"
    When I POST to "/identities/"
    Then response code is equal to 400

  Scenario: Reject a signed identity without a profile
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "missing profile" and handle "missing-profile"
    And I remove the identity profile
    When I POST to "/identities/"
    Then response code is equal to 400

  Scenario: Update a client-signed identity profile and encrypted key pair
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "carol" and handle "carol"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a client-signed identity update body with name "carol updated", handle "carol_new" and password "New-client-password1!"
    And I sign the current identity update request
    When I PUT the created identity
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | profile.name   | carol updated |
      | profile.handle | carol_new     |
      | version        | 2             |
    And response body should contain "identityExternalIdentifier"
    And I add undeclared identity field "password"
    And I sign the current identity update request
    When I PUT the created identity
    Then response code is equal to 400
    When I GET "/identities/carol_new"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | profile.name   | carol updated |
      | profile.handle | carol_new     |
    And response body should contain "identityExternalIdentifier"

  Scenario: Reject a signed identity update without a profile
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "profile owner" and handle "profile-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a client-signed identity update body with name "missing profile", handle "missing_profile" and password "New-client-password1!"
    And I remove the identity profile
    And I sign the current identity update request
    When I PUT the created identity
    Then response code is equal to 400

  Scenario: Reject identity publications above the per-identity rate limit
    Given I am an anonymous user
    And identity publications are limited to 1 per minute
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "flooder" and handle "flooder"
    When I POST to "/identities/"
    Then response code is equal to 200
    When I POST to "/identities/"
    Then response code is equal to 429
    And response body should contain "429040"

  Scenario: Reject identity admissions above the per-network rate limit
    Given I am an anonymous user
    And identity admissions are limited to 1 per network per minute
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174999" and name "admission-network"
    And I set a client-signed identity body with name "first admission" and handle "first-admission"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a client-signed identity body with name "second admission" and handle "second-admission"
    When I POST to "/identities/"
    Then response code is equal to 429
    And response body should contain "429041"

  Scenario: Reject identity admissions above the per-source rate limit
    Given I am an anonymous user
    And identity admissions are limited to 1 per source per minute
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174998" and name "source-admission-network"
    And I set a client-signed identity body with name "first source" and handle "source-first"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a client-signed identity body with name "second source" and handle "source-second"
    When I POST to "/identities/"
    Then response code is equal to 429
    And response body should contain "429042"

  Scenario: Ask for a harder admission proof while a network is busy on this node
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174996" and name "busy-admission-network"
    And this node recently accepted 60 identity admissions into the current network
    And identity admission proofs are mined at exactly 16 bits
    And I set a client-signed identity body with name "busy floor" and handle "busy-floor"
    When I POST to "/identities/"
    Then response code is equal to 400
    And response data should match partially
      """
      { "code": "BadRequestError", "requiredDifficultyBits": 17 }
      """

  Scenario: Admit a proof that meets the raised difficulty while a network is busy
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174995" and name "busy-proven-network"
    And this node recently accepted 60 identity admissions into the current network
    And identity admission proofs are mined at exactly 17 bits
    And I set a client-signed identity body with name "busy proven" and handle "busy-proven"
    When I POST to "/identities/"
    Then response code is equal to 200

  Scenario: Reject identity updates above the per-source rate limit
    Given I am an anonymous user
    And identity admissions are limited to 1 per source per minute
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174997" and name "source-update-network"
    And I set a client-signed identity body with name "source update" and handle "source-update"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a client-signed identity update body with name "source renamed", handle "source_renamed" and password "New-client-password1!"
    And I sign the current identity update request
    When I PUT the created identity
    Then response code is equal to 429
    And response body should contain "429042"
