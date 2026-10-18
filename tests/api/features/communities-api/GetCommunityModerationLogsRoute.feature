Feature: Get community moderation logs

  Scenario: List moderation logs for community administration
    Given I register a test IPFS network "community-moderation-logs-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
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

  Scenario: A moderator pages the moderation log with a cursor and refuses a cursor from another list
    Given I register a test IPFS network "community-moderation-logs-cursor-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I sign the current community moderation logs request
    When I GET moderation logs from the current community with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 moderation logs
    And I remember the response next cursor
    And I sign the current community moderation logs request
    When I GET moderation logs from the current community with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 moderation logs
    And I sign the current community moderation logs request
    When I GET moderation logs from the current community with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
    And I sign the current community moderation logs request
    When I GET moderation logs from the current community with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A member kick is recorded in the moderation log
    Given I register a test IPFS network "community-kick-moderation-logs-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And I remember the current community membership request
    And I set an accepted community membership request body
    And I sign the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And I sign the current community kick request for another identity
    When I DELETE the kick for another identity from the current community
    Then response code is equal to 200
    And response body should not contain the other identity id
    And I sign the current community moderation logs request
    When I GET moderation logs from the current community
    Then response code is equal to 200
    And response body should contain "member_kicked"
    And response body should contain "member"
