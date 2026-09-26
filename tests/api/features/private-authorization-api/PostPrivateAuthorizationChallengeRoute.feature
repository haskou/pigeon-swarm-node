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
