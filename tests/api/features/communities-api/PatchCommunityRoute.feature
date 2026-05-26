Feature: Patch community API
  As a community owner
  I want to update community profile metadata
  So that accidental profile payload fields cannot remove channels

  Scenario: Updating community profile preserves channels
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-profile-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I set a community voice channel body
    And I sign the current community voice channel request
    When I POST a voice channel to the current community
    Then response code is equal to 200
    And I set a community profile body with empty channel lists
    And I sign the current community profile update request
    When I PATCH the current community
    Then response code is equal to 200
    And response body should contain "Updated API community"
    And response body should contain "general"
    And response body should contain "voice"

  Scenario: Updating community profile enables auto join
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-profile-auto-join-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community profile body enabling auto join
    And I sign the current community profile update request
    When I PATCH the current community
    Then response code is equal to 200
    And response body should contain "autoJoinEnabled"
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And response body should contain "accepted"
