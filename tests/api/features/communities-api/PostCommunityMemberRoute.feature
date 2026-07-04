Feature: Post community member API
  As a community owner
  I want to invite members to private communities
  So that invited identities can choose whether to join

  Scenario: Owner invites a member and the member accepts before reading the private community
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And response body should contain "pending"
    And response body should contain "invitation"
    And I remember the current community membership request
    And the community member signs the current community request
    When I GET the current community
    Then response code is equal to 409
    And the community member signs the community membership requests request
    When I GET community membership requests
    Then response code is equal to 200
    And response body should contain "pending"
    And I set an accepted community membership request body
    And the community member signs the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And response body should contain "accepted"
    And the community member signs the current communities request
    When I GET current communities
    Then response code is equal to 200
    And response body should contain "API community"
    And the community member signs the current community request
    When I GET the current community
    Then response code is equal to 200
    And response body should contain "Private API community"
