Feature: PUT /presence/me

  Scenario: Update authenticated identity presence
    Given I set json body
      """
      {
        "status": "busy",
        "customMessage": "Recording"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "status": "busy",
        "customMessage": "Recording"
      }
      """

  Scenario: Reject disconnected as a selected presence
    Given I set json body
      """
      {
        "status": "disconnected"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 400
