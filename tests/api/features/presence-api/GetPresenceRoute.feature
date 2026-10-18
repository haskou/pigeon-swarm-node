Feature: GET /presence

  Background:
    Given I register a test IPFS network "presence-api-network"

  Scenario: Read current identity presence
    Given I set json body
      """
      {
        "status": "available"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 200
    Given I sign the current identity presence request
    When I GET the current identity presence
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "status": "available"
      }
      """

  Scenario: List current identity presence
    Given I sign the current presence list request
    When I GET the current presence list
    Then response code is equal to 200
    And response body is an array with length of 1

  Scenario: Refuse a malformed presence list identity id
    Given I sign the current presence list request
    When I GET the presence list with identityIds "unknown"
    Then response code is equal to 400

  Scenario: Hide presence status from a viewer without a shared relationship
    Given I set json body
      """
      {
        "status": "available"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 200
    Given another identity signs the current identity presence request
    When I GET the current identity presence
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "status": "disconnected"
      }
      """

  Scenario: Hide presence list status from a viewer without a shared relationship
    Given I set json body
      """
      {
        "status": "available"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 200
    Given another identity signs the current presence list request
    When I GET the current presence list
    Then response code is equal to 200
    And response body is an array with length of 1
    And response body should contain "\"status\":\"disconnected\""
    And response body should not contain "Ready"

  Scenario: Show presence status to a one-to-one conversation participant
    Given I have created a one-to-one conversation
    And I set json body
      """
      {
        "status": "available"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 200
    Given another identity signs the current identity presence request
    When I GET the current identity presence
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "status": "available"
      }
      """
