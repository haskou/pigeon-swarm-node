Feature: Get community moderation logs

  Scenario: List moderation logs for community administration
    Given I register an in-memory IPFS network "community-moderation-logs-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I sign the current community moderation logs request
    When I GET moderation logs from the current community
    Then response code is equal to 200
    And response body should contain "channel_created"
    And response body should contain "channel"
