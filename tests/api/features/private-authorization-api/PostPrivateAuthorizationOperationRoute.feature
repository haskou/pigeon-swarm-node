Feature: Accept a private authorization operation

  Scenario: Parse an operation envelope at every documented field limit
    Given I set a maximum-size private authorization operation envelope
    And I sign the current private authorization operation request
    When I POST to "/private-authorization/operations"
    Then response code is equal to 409
