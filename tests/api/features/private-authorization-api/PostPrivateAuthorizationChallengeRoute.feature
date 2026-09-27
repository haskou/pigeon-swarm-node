Feature: Request a private authorization challenge

  Scenario: Reject an invalid private operation without reflecting sensitive input
    Given I set json body
      """
      {
        "signedOperationJson": "sensitive-invalid-operation"
      }
      """
    And I sign the current private authorization challenge request
    When I POST to "/private-authorization/challenges"
    Then response code is equal to 409
    And response body should not contain "sensitive-invalid-operation"

  Scenario: Reject an invalid DTO without reflecting its value
    Given I set a non-string private authorization challenge body containing "sensitive-validation-secret"
    And I sign the current private authorization challenge request
    When I POST to "/private-authorization/challenges"
    Then response code is equal to 400
    And response body should not contain "sensitive-validation-secret"

  Scenario: Parse an operation at the documented field limit
    Given I set a maximum-length private authorization operation
    And I sign the current private authorization challenge request
    When I POST to "/private-authorization/challenges"
    Then response code is equal to 409
