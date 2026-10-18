Feature: JSON request body content type

  Scenario: A body sent with a non-JSON content type is refused with 415
    Given I am an anonymous user
    And I set a non-JSON body with content type "text/plain"
    When I POST to "/conversations"
    Then response code is equal to 415
    And response body should contain "UnsupportedMediaTypeError"
