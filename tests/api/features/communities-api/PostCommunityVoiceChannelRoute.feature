Feature: Post community voice channel API
  As a community owner
  I want to create private community voice channels
  So that members can join calls from the community

  Scenario: Owner creates a private community voice channel
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-voice-channel-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community voice channel body
    And I sign the current community voice channel request
    When I POST a voice channel to the current community
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name | voice |
      | type | voice |
    And I sign the current community channels request
    When I GET channels from the current community
    Then response code is equal to 200
    And response body should contain "connectedIdentityIds"
