Feature: React to community channel messages
  As a community member
  I want to react to private community text channel messages
  So that reactions are synchronized without rewriting encrypted messages

  Scenario: Add and list a community channel message reaction
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-message-reaction-network"
    And I have created a private community text channel
    And I have sent an encrypted community channel message
    And I set a community channel message reaction body
    And I sign the current community channel message reaction request
    When I POST the reaction to the current community channel message
    Then response code is equal to 200
    And response data should match partially
    """
    {
      "emoji": "👍"
    }
    """
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 200
    And response body should contain "reactions"
    And response body should contain "👍"

  Scenario: Remove a community channel message reaction
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-message-reaction-removal-network"
    And I have created a private community text channel
    And I have sent an encrypted community channel message
    And I set a community channel message reaction body
    And I sign the current community channel message reaction request
    And I have reacted to the current community channel message
    And I sign the current community channel message reaction removal request
    When I DELETE the reaction from the current community channel message
    Then response code is equal to 200
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 200
    And response body should not contain "👍"
