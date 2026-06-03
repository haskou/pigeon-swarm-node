Feature: GET /notification-settings/

  Scenario: List authenticated identity notification settings
    Given I sign the current notification settings request
    When I GET "/notification-settings/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "scopes": []
      }
      """
