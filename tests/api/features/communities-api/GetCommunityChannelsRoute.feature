Feature: Get community channels API
  As a community member
  I want channel lists to include thread summaries
  So that clients can show active thread indicators without loading messages

  Scenario: List text channels with active thread summaries
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-channel-threads-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I set an encrypted community channel message body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And I set an encrypted community channel reply body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And I sign the current community channels request
    When I GET channels from the current community
    Then response code is equal to 200
    And response body should contain "threads"
    And response body should contain "replyCount"
    And response body should contain "lastReplyMessageId"

  Scenario: Do not list threads whose root message was deleted
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-deleted-channel-threads-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I set an encrypted community channel message body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And I remember the current community channel message as thread root
    And I set an encrypted community channel reply body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And I restore the remembered community channel thread root message
    And I set a delete community channel message body
    And I sign the current community channel message deletion request
    When I DELETE the current community channel message
    Then response code is equal to 200
    And I sign the current community channels request
    When I GET channels from the current community
    Then response code is equal to 200
    And response body should not contain "threads"

  Scenario: Remove voice presence after a participant stops sending heartbeats
    Given I register a test IPFS network "communities-api-voice-presence-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community voice channel body
    And I sign the current community voice channel request
    When I POST a voice channel to the current community
    Then response code is equal to 200
    And I remember the current community voice channel
    And I set a community channel call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 201
    And I remember the current call
    And I sign the current community channels request
    When I GET channels from the current community
    Then response code is equal to 200
    And the current voice channel has 1 connected identities
    When the current call heartbeat expires
    And I sign the current call request
    And I GET the current call
    Then response code is equal to 200
    And the current call has no live participants
    And I sign the current community channels request
    When I GET channels from the current community
    Then response code is equal to 200
    And the current voice channel has 0 connected identities

  Scenario: A member pages the channels and follows the cursor to the end
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-channel-paging-network"
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
    Given I sign the current community channels request
    When I GET channels from the current community with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 channels
    And I remember the response next cursor
    Given I sign the current community channels request
    When I GET channels from the current community with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 channels
    And I remember the response next cursor
    Given I sign the current community channels request
    When I GET channels from the current community with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 channels
    And the response next cursor is null

  Scenario: A garbage, foreign, or forged channels cursor is refused
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-channel-cursor-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    Given I sign the current community channels request
    When I GET channels from the current community with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community channels request
    When I GET channels from the current community with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community channels request
    When I GET channels from the current community with a cursor whose position is not a channel id
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A non-member cannot list the channels
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-channels-non-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    Given the community member signs the current community channels request
    When I GET channels from the current community with query "?limit=1"
    Then response code is equal to 409

  Scenario: A non-member presenting a valid channels cursor gets the same 409
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-channels-non-member-cursor-network"
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
    Given I sign the current community channels request
    When I GET channels from the current community with query "?limit=1"
    Then response code is equal to 200
    And I remember the response next cursor
    Given the community member signs the current community channels request
    When I GET channels from the current community with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 409

  Scenario: A member cannot list or read a text channel restricted to a role they lack
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-hidden-text-channel-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community administrator role body
    And I sign the current community role request
    When I POST a role to the current community
    Then response code is equal to 200
    And I remember the current community role
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I set current community channel visible for the current role
    And I sign the current community channel permissions request
    When I PATCH permissions for the current community channel
    Then response code is equal to 200
    Given the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And I remember the current community membership request
    And I set an accepted community membership request body
    And I sign the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    Given I sign the current community channels request
    When I GET channels from the current community with query "?limit=100"
    Then response code is equal to 200
    And response body should contain the current community channel id
    Given the community member signs the current community channels request
    When I GET channels from the current community with query "?limit=100"
    Then response code is equal to 200
    And response body should not contain the current community channel id
    Given the community member signs the current community channel pins request
    When I GET pins from the current community channel with query "?limit=1"
    Then response code is equal to 409

  Scenario: A member cannot list a voice channel restricted to a role they lack
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-hidden-voice-channel-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community administrator role body
    And I sign the current community role request
    When I POST a role to the current community
    Then response code is equal to 200
    And I remember the current community role
    And I set a community voice channel body
    And I sign the current community voice channel request
    When I POST a voice channel to the current community
    Then response code is equal to 200
    And I remember the current community voice channel
    And I set current community channel visible for the current role
    And I sign the current community channel permissions request
    When I PATCH permissions for the current community channel
    Then response code is equal to 200
    Given the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 200
    And I remember the current community membership request
    And I set an accepted community membership request body
    And I sign the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    Given I sign the current community channels request
    When I GET channels from the current community with query "?limit=100"
    Then response code is equal to 200
    And response body should contain the current community channel id
    Given the community member signs the current community channels request
    When I GET channels from the current community with query "?limit=100"
    Then response code is equal to 200
    And response body should not contain the current community channel id
