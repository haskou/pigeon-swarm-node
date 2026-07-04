Feature: Post identity route
  As an API consumer
  I want to publish a signed identity
  So that I can use it in the system

  Scenario: Reject legacy backend-generated identity creation
    Given I am an anonymous user
    And I register a private IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
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
    And I register a private IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a client-signed identity body with name "bob" and handle "bob"
    When I POST to "/identities/"
    Then response code is equal to 200
	    And response contains a valid resource with the following fields
	      | profile.name   | bob                                  |
	      | profile.handle | bob                                  |
	      | networks[0]    | 123e4567-e89b-12d3-a456-426614174000 |
	    And response body should contain "encryptedMasterKey"
	    And response body should contain "masterKeyDerivation"
	    And response body should contain "identityExternalIdentifier"
    And it has been pinned in ipfs
    When I GET "/identities/bob"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | profile.name   | bob |
      | profile.handle | bob |
    And response body should contain "identityExternalIdentifier"

  Scenario: Update a client-signed identity profile and encrypted key pair
    Given I am an anonymous user
    And I register a private IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
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
    When I GET "/identities/carol_new"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | profile.name   | carol updated |
      | profile.handle | carol_new     |
    And response body should contain "identityExternalIdentifier"
