Feature: Post identity route
  As an API consumer
  I want to create an identity
  So that I can use it in the system

  Scenario: Create identity successfully
    Given I am an anonymous user
    And I register an in-memory IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set json body
      """
      {
        "name": "alice",
        "password": "super-secret-password",
        "networks": [
          "123e4567-e89b-12d3-a456-426614174000"
        ]
      }
      """
    When I POST to "/identities/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | profile.name | alice                                |
      | networks[0]  | 123e4567-e89b-12d3-a456-426614174000 |
    And it has been pinned in ipfs
