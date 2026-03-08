Feature: Get example
  As an example I want to test GET /

  Scenario: Open /hewo
    Given I am an anonymous user
    When I GET "/hewo"
    Then response code is equal to 200
    And response body should contain "Hello World"
