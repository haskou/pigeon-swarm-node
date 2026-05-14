Feature: Post community channel message API
  As a community member
  I want to send encrypted messages to private community text channels
  So that channel participants can exchange private messages

  Scenario: Member sends and lists encrypted private community text channel messages
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-message-network"
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
    And response body should contain "encrypted-community-channel-message-payload"
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 200
    And response body should contain "encrypted-community-channel-message-payload"
