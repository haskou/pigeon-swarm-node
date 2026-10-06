Feature: Signed operation body validation
  As an API client
  I want a missing or malformed signed operation to be rejected as invalid input
  So that the node answers 400 instead of failing with a server error

  Scenario: POST /conversations/{id}/members without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {"identityId": "123e4567-e89b-12d3-a456-426614174002"}
      """
    When I POST to "/conversations/123e4567-e89b-12d3-a456-426614174001/members"
    Then response code is equal to 400

  Scenario: DELETE /conversations/{id}/members/me without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/conversations/123e4567-e89b-12d3-a456-426614174001/members/me"
    Then response code is equal to 400

  Scenario: DELETE /conversations/{id}/members/{identity} without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/conversations/123e4567-e89b-12d3-a456-426614174001/members/123e4567-e89b-12d3-a456-426614174002"
    Then response code is equal to 400

  Scenario: PUT /conversations/{id}/admins/{identity} without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I PUT "/conversations/123e4567-e89b-12d3-a456-426614174001/admins/123e4567-e89b-12d3-a456-426614174002"
    Then response code is equal to 400

  Scenario: DELETE /conversations/{id}/admins/{identity} without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/conversations/123e4567-e89b-12d3-a456-426614174001/admins/123e4567-e89b-12d3-a456-426614174002"
    Then response code is equal to 400

  Scenario: POST /conversations/{id}/members with a non-object operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {"identityId": "123e4567-e89b-12d3-a456-426614174002", "operation": "signed"}
      """
    When I POST to "/conversations/123e4567-e89b-12d3-a456-426614174001/members"
    Then response code is equal to 400

  Scenario: POST /conversations/{id}/members with an operation missing its mutation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {"identityId": "123e4567-e89b-12d3-a456-426614174002", "operation": {"createdAt": 1, "parents": []}}
      """
    When I POST to "/conversations/123e4567-e89b-12d3-a456-426614174001/members"
    Then response code is equal to 400

  Scenario: DELETE /communities/{id}/roles/{sub} without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/communities/123e4567-e89b-12d3-a456-426614174001/roles/123e4567-e89b-12d3-a456-426614174002"
    Then response code is equal to 400

  Scenario: DELETE /communities/{id}/bans/{sub} without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/communities/123e4567-e89b-12d3-a456-426614174001/bans/123e4567-e89b-12d3-a456-426614174002"
    Then response code is equal to 400

  Scenario: DELETE /communities/{id}/channels/{sub} without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/communities/123e4567-e89b-12d3-a456-426614174001/channels/123e4567-e89b-12d3-a456-426614174002"
    Then response code is equal to 400

  Scenario: DELETE /communities/{id}/members/me without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/communities/123e4567-e89b-12d3-a456-426614174001/members/me"
    Then response code is equal to 400

  Scenario: DELETE /communities/{id}/members/{sub}/kick without operation
    Given I register a test IPFS network "api-operation-validation-network"
    And I set json body
      """
      {}
      """
    When I DELETE "/communities/123e4567-e89b-12d3-a456-426614174001/members/123e4567-e89b-12d3-a456-426614174002/kick"
    Then response code is equal to 400
