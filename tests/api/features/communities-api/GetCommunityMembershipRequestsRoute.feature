Feature: Get community membership requests API
  As an identity
  I want to see invitations and join requests related to me
  So that both sides can track pending community membership

  Scenario: Owner sees invitations they created
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-membership-requests-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And I sign the current community membership requests request
    When I GET community membership requests
    Then response code is equal to 200
    And response body should contain "invitation"
    And response body should contain "pending"
