Feature: Post community text channel API
  As a community owner
  I want to create private community text channels
  So that community members can chat in named spaces

  Scenario: Owner creates a private community text channel
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-channel-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name | general |
      | type | text    |

  Scenario: Non-owner cannot create a private community text channel
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-owner-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And another identity signs the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 409
    And response body should contain "Community permission denied"
