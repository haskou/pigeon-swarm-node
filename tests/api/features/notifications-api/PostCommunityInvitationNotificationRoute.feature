Feature: Post community invitation notification API
  As a community owner
  I want to create community invitation notifications
  So that invited identities can receive the encrypted community key

  Scenario: Create a community invitation notification
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-notification-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community invitation notification body
    And I sign the current notification creation request
    When I POST to "/notifications/"
    Then response code is equal to 200
    And response body should contain "community_invitation"
    And response body should contain "encrypted-community-key"
