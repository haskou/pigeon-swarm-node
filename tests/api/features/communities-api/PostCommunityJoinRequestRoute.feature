Feature: Post community join request API
  As a non-member identity
  I want to request access to a private community
  So that the owner can approve my membership

  Scenario: Request to join a community and owner accepts it
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-join-request-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And response body should contain "pending"
    And response body should contain "request"
    And I remember the current community membership request
    And I sign the current community membership requests request
    When I GET community membership requests
    Then response code is equal to 200
    And response body should contain "pending"
    And I set an accepted community membership request body
    And I sign the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And response body should contain "accepted"
    And the community member signs the current community request
    When I GET the current community
    Then response code is equal to 200
    And response body should contain "Private API community"
