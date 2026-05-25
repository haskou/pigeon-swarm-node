Feature: Post community invite API
  As a community owner
  I want to create bearer invite links
  So that identities can join a private community after opening a link

  Scenario: Owner creates an invite and another identity accepts it
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-invite-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community invite body
    And I sign the current community invite request
    When I POST to the current community invites
    Then response code is equal to 200
    And response body should contain "inviteToken"
    And I remember the current community invite
    And the community member signs the current community invite accept request
    When I POST to accept the current community invite
    Then response code is equal to 200
    And response body should contain the other identity id
    And the community member signs the current community request
    When I GET the current community
    Then response code is equal to 200
    And response body should contain "Private API community"

  Scenario: Owner creates an invite with an encrypted community key
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-encrypted-invite-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community invite body with an encrypted community key
    And I sign the current community invite request
    When I POST to the current community invites
    Then response code is equal to 200
    And response body should contain "encryptedCommunityKey"
    And response body should contain "encryptedcommunitykeyciphertext"
    And I remember the current community invite
    When I GET the current community invite
    Then response code is equal to 200
    And response body should contain "encryptedCommunityKey"
    And response body should contain "API community"

  Scenario: Invite cannot be accepted more times than allowed
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-invite-max-uses-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community invite body
    And I sign the current community invite request
    When I POST to the current community invites
    Then response code is equal to 200
    And I remember the current community invite
    And the community member signs the current community invite accept request
    When I POST to accept the current community invite
    Then response code is equal to 200
    And the community member signs the current community invite accept request
    When I POST to accept the current community invite
    Then response code is equal to 409
    And response body should contain "Community invite maximum uses exceeded"

  Scenario: Expired invite cannot be accepted
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-expired-invite-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set an expired community invite body
    And I sign the current community invite request
    When I POST to the current community invites
    Then response code is equal to 200
    And I remember the current community invite
    And the community member signs the current community invite accept request
    When I POST to accept the current community invite
    Then response code is equal to 409
    And response body should contain "Community invite has expired"
