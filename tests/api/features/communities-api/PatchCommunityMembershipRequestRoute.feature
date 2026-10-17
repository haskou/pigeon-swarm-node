Feature: Patch community membership request API
  As a community owner
  I want to decline a community join request
  So that the requester can see that the request was rejected

  Scenario: Owner declines a join request
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-decline-request-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 200
    And I remember the current community
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And I remember the current community membership request
    And I set a declined community membership request body
    And I sign the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And response body should contain "declined"
    And I sign the current community membership requests request
    When I GET community membership requests
    Then response code is equal to 200
    And response body should contain "declined"
