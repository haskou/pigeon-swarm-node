Feature: Post link preview route
  As an API consumer
  I want link previews to be fetched safely by the backend
  So that clients can render URL cards without exposing local networks

  Scenario: Reject localhost link previews
    Given I am an anonymous user
    And I set json body
      """
      {
        "url": "http://localhost/private"
      }
      """
    And I sign the current link preview request
    When I POST to "/link-previews"
    Then response code is equal to 400
    And response body should contain "Localhost URLs cannot be previewed"
