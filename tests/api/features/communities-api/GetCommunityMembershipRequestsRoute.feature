Feature: Get community membership requests API
  As an identity
  I want to see join requests related to me
  So that both sides can track pending community membership

  Scenario: Owner sees join requests for their community
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-membership-requests-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 200
    And I remember the current community
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And I sign the current community membership requests request
    When I GET community membership requests
    Then response code is equal to 200
    And response body should contain "request"
    And response body should contain "pending"
