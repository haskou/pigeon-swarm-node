Feature: Patch community channel API
  As a community owner
  I want to rename community channels
  So that channel labels can evolve with the community

  Scenario: Owner renames a private community text channel
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-channel-rename-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I set a community text channel rename body
    And I sign the current community text channel rename request
    When I PATCH the current community text channel
    Then response code is equal to 200
    And response body should contain "announcements"
