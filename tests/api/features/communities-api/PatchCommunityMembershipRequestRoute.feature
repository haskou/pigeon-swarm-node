Feature: Patch community membership request API
  As an invited identity
  I want to decline a community invitation
  So that the owner can see that the invitation was rejected

  Scenario: Invited identity declines an invitation
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-decline-invitation-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And I remember the current community membership request
    And I set a declined community membership request body
    And the community member signs the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And response body should contain "declined"
    And I sign the current community membership requests request
    When I GET community membership requests
    Then response code is equal to 200
    And response body should contain "declined"
