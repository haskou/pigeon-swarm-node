Feature: Post community API
  As an API consumer
  I want to create private communities
  So that identities can organize private spaces in a network

  Scenario: Create a private community successfully
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name       | API community |
      | visibility | private       |
    And response body should contain "bafybeigcommunityavatar"
    And response body should contain "bafybeigcommunitybanner"

  Scenario: Create a public community successfully
    Given I am an anonymous user
    And I register an in-memory IPFS network "public-communities-api-network"
    And I set a public community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name       | Public API community |
      | visibility | public               |
