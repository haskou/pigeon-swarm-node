Feature: Community bans API
  As a community moderator
  I want to ban identities
  So that banned identities cannot join the community

  Scenario: Owner bans an identity and blocks join requests
    Given I am an anonymous user
    And I register a private IPFS network "communities-api-bans-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community ban body for another identity
    And I sign the current community ban request
    When I POST a ban to the current community
    Then response code is equal to 200
    And response body should contain "bannedMemberIds"
    And the community member signs the current community join request
    When I POST to request joining the current community
    Then response code is equal to 409
    And response body should contain "Identity is banned"
