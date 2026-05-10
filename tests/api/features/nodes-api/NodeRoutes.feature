Feature: Node API

  Scenario: Read node state, add networks and manage ownership
    Given I am an anonymous user
    When I GET "/node/"
    Then response code is equal to 200
    And response body should contain "id"
    And response body should not contain "owner"

    When I GET "/node/networks/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": []
      }
      """

    Given I set json body
      """
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "public"
      }
      """
    When I POST to "/node/networks/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "public"
          }
        ]
      }
      """

    Given I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200
    And response body should contain "owner"

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And another identity signs the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 403

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And another identity signs the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 409
