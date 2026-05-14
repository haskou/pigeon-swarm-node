Feature: Post community member API
  As a community owner
  I want to add members to private communities
  So that invited identities can read the community

  Scenario: Owner adds a member and the member can read the private community
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And the community member signs the current communities request
    When I GET current communities
    Then response code is equal to 200
    And response body should contain "API community"
    And the community member signs the current community request
    When I GET the current community
    Then response code is equal to 200
    And response body should contain "Private API community"
