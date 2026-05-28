Feature: Get community channels API
  As a community member
  I want channel lists to include thread summaries
  So that clients can show active thread indicators without loading messages

  Scenario: List text channels with active thread summaries
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-channel-threads-network"
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
