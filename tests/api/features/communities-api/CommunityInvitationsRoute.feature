Feature: Community invitations API
  As a community manager
  I want to issue signed invitations and admit their holders
  So that only whoever holds the link can be admitted, and only while it is live

  Background:
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-invitations-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
    Then response code is equal to 201
    And I remember the current community
    And I set a community invitation body with 1 uses
    And I sign the current community invitation request
    When I POST an invitation to the current community
    Then response code is equal to 200
    And response body should contain "invitationKey"
    And I remember the current community invitation

  Scenario: A link holder claims the invitation and the owner admits it
    Given I sign the current community invitations request
    When I GET the current community invitations
    Then response code is equal to 200
    And response body should contain "invitations"
    When I GET the current community invitation preview with the invitation key
    Then response code is equal to 200
    And response body should contain "API community"
    And response does not contain property "invitationKey"
    And response does not contain property "members"
    Given the other identity signs a claim of the current community invitation
    When the other identity POSTs the claim of the current community invitation
    Then response code is equal to 200
    And response body should contain the other identity id
    Given the other identity signs a claim of the current community invitation
    When the other identity POSTs the claim of the current community invitation
    Then response code is equal to 409
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims
    Then response code is equal to 200
    And response body should contain the other identity id
    Given I sign the admission of the other identity to the current community
    When I POST the admission of the other identity to the current community
    Then response code is equal to 200
    And response body should contain the other identity id
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims
    Then response code is equal to 200
    And response body should not contain the other identity id

  Scenario: A preview without the invitation key is refused like an unknown community
    When I GET the current community invitation preview without a key
    Then response code is equal to 404
    When I GET the current community invitation preview with the malformed key
    Then response code is equal to 404
    When I GET the current community invitation preview with the unknown key
    Then response code is equal to 404
    And response body should not contain the current community id

  Scenario: A revoked invitation can neither be previewed nor claimed
    Given I sign the revocation of the current community invitation
    When I POST the revocation of the current community invitation
    Then response code is equal to 200
    And response body should contain "\"revoked\":true"
    When I GET the current community invitation preview with the invitation key
    Then response code is equal to 404
    Given the other identity signs a claim of the current community invitation
    When the other identity POSTs the claim of the current community invitation
    Then response code is equal to 409

  Scenario: A member pages the invitations by id and follows the cursor to the end
    Given I set a community invitation body with 1 uses
    And I sign the current community invitation request
    When I POST an invitation to the current community
    Then response code is equal to 200
    Given I sign the current community invitations request
    When I GET the current community invitations with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 invitations
    And I remember the response next cursor
    Given I sign the current community invitations request
    When I GET the current community invitations with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 1 invitations
    And I remember the response next cursor
    Given I sign the current community invitations request
    When I GET the current community invitations with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 invitations
    And the response next cursor is null

  Scenario: A short last page has a null next cursor and the limit is clamped to 1..100
    Given I set a community invitation body with 1 uses
    And I sign the current community invitation request
    When I POST an invitation to the current community
    Then response code is equal to 200
    Given I sign the current community invitations request
    When I GET the current community invitations with query "?limit=0"
    Then response code is equal to 200
    And response lists 1 invitations
    Given I sign the current community invitations request
    When I GET the current community invitations with query "?limit=500"
    Then response code is equal to 200
    And response lists 2 invitations
    And the response next cursor is null

  Scenario: A garbage, foreign, or forged invitations cursor is refused
    Given I sign the current community invitations request
    When I GET the current community invitations with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community invitations request
    When I GET the current community invitations with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community invitations request
    When I GET the current community invitations with a cursor whose position is not an invitation id
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A manager pages the pending claims and refuses a foreign or forged cursor
    Given the other identity signs a claim of the current community invitation
    When the other identity POSTs the claim of the current community invitation
    Then response code is equal to 200
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims with query "?limit=1"
    Then response code is equal to 200
    And response lists 1 claims
    And I remember the response next cursor
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims with query "?limit=1&cursor=CURSOR"
    Then response code is equal to 200
    And response lists 0 claims
    And the response next cursor is null
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims with query "?limit=50"
    Then response code is equal to 200
    And response lists 1 claims
    And the response next cursor is null
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims with a cursor whose position is not a claim id
    Then response code is equal to 400
    And response body should contain "400110"
    Given I sign the current community invitation claims request
    When I GET the current community invitation claims with query "?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"
