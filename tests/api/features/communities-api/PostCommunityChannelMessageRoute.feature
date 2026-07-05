Feature: Post community channel message API
  As a community member
  I want to send encrypted messages to private community text channels
  So that channel participants can exchange private messages

  Scenario: Member sends and lists encrypted private community text channel messages
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-message-network"
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

  Scenario: Member sends and searches plaintext public community text channel messages
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-public-message-network"
    And I set a public community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I set a plaintext community channel message body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And response body should contain "plain public searchable community message"
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 200
    And response body should contain "plain public searchable community message"
    And I sign the current community channel message search request
    When I search messages from the current community text channel
    Then response code is equal to 200
    And response body should contain "plain public searchable community message"
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I set a plaintext community channel message body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And I sign the current community message search request
    When I search messages from the current community
    Then response code is equal to 200
    And response body should contain "plain public searchable community message"

  Scenario: Owner sends a message mentioning everyone
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-message-mentions-network"
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
    And I set an encrypted community channel message body mentioning everyone
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And response body should contain "mentions"
    And response body should contain "everyone"
