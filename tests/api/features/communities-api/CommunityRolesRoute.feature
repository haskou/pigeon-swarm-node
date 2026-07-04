Feature: Community roles API
  As a community owner
  I want to grant permissions through roles
  So that trusted members can administer parts of a community

  Scenario: Owner grants channel management through a role
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-roles-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community administrator role body
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
    And I set a community text channel body
    And another identity signs the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name | general |
      | type | text    |

  Scenario: Owner restricts a channel to a role
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-channel-permissions-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
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
    And response body should contain "visibleRoleIds"
