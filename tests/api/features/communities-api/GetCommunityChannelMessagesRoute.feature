Feature: Get community channel messages

  Scenario: A member pages channel messages with a cursor and a cursor from another channel is refused
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-message-cursor-network"
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
    And I set an encrypted community channel message body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And I sign the current community channel messages request
    When I GET messages from the current community text channel with query "?limit=1"
    Then response code is equal to 200
    And I remember the response next cursor
    And I sign the current community channel messages request
    When I GET messages from the current community text channel with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I sign the current community channel messages request
    When I GET messages from the current community text channel with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 400
    And response body should contain "400110"
    And I sign the current community channel messages request
    When I GET messages from the current community text channel with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
