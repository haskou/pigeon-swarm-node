Feature: Get community moderation logs

  Scenario: List moderation logs for community administration
    Given I register a test IPFS network "community-moderation-logs-network"
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

  Scenario: A member kick is recorded in the moderation log
    Given I register a test IPFS network "community-kick-moderation-logs-network"
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
    And I set an accepted community membership request body
    And the community member signs the current membership request update
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

  Scenario: A member manager without invite permission cannot read invite tokens from the log
    Given I register a test IPFS network "community-invite-moderation-logs-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member manager role body
    And I sign the current community role request
    When I POST a role to the current community
    Then response code is equal to 200
    And I remember the current community role
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And I remember the current community membership request
    And I set an accepted community membership request body
    And the community member signs the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And I set community member roles body with the current role
    And I sign the current community member roles request
    When I PUT roles for the current community member
    Then response code is equal to 200
    And I set a community invite body
    And I sign the current community invite request
    When I POST to the current community invites
    Then response code is equal to 200
    And I remember the current community invite
    And the community member signs the current community moderation logs request
    When I GET moderation logs from the current community
    Then response code is equal to 200
    And response body should contain "invite_link_created"
    And response body should not contain the current community invite token
