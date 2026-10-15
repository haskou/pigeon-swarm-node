Feature: Conversation drafts live under opaque keys
  The client derives each draft key as HMAC(owner draft key, conversation id).
  The node stores sealed drafts per identity under that key and never learns
  which conversation a draft belongs to, so it checks no conversation roster.

  Background:
    Given I register a test IPFS network "conversation-drafts-api-network"

  Scenario: Save, list and delete a draft under an opaque key
    Given I set json body
      """
      {
        "encryptedPayload": "sealed-draft-payload",
        "updatedAt": 1700000000000
      }
      """
    And I sign a PUT request to "/conversations/me/drafts/eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4"
    When I PUT "/conversations/me/drafts/eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4"
    Then response code is equal to 200
    And response data should match exactly
      """
      {
        "draftKey": "eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4",
        "encryptedPayload": "sealed-draft-payload",
        "updatedAt": 1700000000000
      }
      """
    Given I sign a GET request to "/conversations/me/drafts"
    When I GET "/conversations/me/drafts"
    Then response code is equal to 200
    And response data should match exactly
      """
      {
        "drafts": [
          {
            "draftKey": "eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4",
            "encryptedPayload": "sealed-draft-payload",
            "updatedAt": 1700000000000
          }
        ]
      }
      """
    Given I sign a DELETE request to "/conversations/me/drafts/eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4"
    When I DELETE "/conversations/me/drafts/eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4"
    Then response code is equal to 200
    And response data should match exactly
      """
      {
        "draftKey": "eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4"
      }
      """
    Given I sign a GET request to "/conversations/me/drafts"
    When I GET "/conversations/me/drafts"
    Then response data should match exactly
      """
      {
        "drafts": []
      }
      """

  Scenario: Another identity neither sees nor deletes my drafts
    Given I set json body
      """
      {
        "encryptedPayload": "sealed-draft-payload",
        "updatedAt": 1700000000000
      }
      """
    And I sign a PUT request to "/conversations/me/drafts/L7OYmM9rXK294jd9FNvHMxyq8IJdWRBtCQ3ut4Wqo4k"
    And I PUT "/conversations/me/drafts/L7OYmM9rXK294jd9FNvHMxyq8IJdWRBtCQ3ut4Wqo4k"
    And another identity signs a DELETE request to "/conversations/me/drafts/L7OYmM9rXK294jd9FNvHMxyq8IJdWRBtCQ3ut4Wqo4k"
    And I DELETE "/conversations/me/drafts/L7OYmM9rXK294jd9FNvHMxyq8IJdWRBtCQ3ut4Wqo4k"
    And another identity signs a GET request to "/conversations/me/drafts"
    When I GET "/conversations/me/drafts"
    Then response code is equal to 200
    And response data should match exactly
      """
      {
        "drafts": []
      }
      """
    Given I sign a GET request to "/conversations/me/drafts"
    When I GET "/conversations/me/drafts"
    Then response data should match partially
      """
      {
        "drafts": [
          {
            "draftKey": "L7OYmM9rXK294jd9FNvHMxyq8IJdWRBtCQ3ut4Wqo4k"
          }
        ]
      }
      """

  Scenario: A draft key that is not an opaque digest is rejected
    Given I set json body
      """
      {
        "encryptedPayload": "sealed-draft-payload"
      }
      """
    And I sign a PUT request to "/conversations/me/drafts/one-to-one-conversation"
    When I PUT "/conversations/me/drafts/one-to-one-conversation"
    Then response code is equal to 409
    And response data should match partially
      """
      {
        "code": "InvalidConversationDraftKeyError"
      }
      """

  Scenario: A draft payload longer than the limit is rejected
    Given I set json body with "encryptedPayload" of 65537 characters
    And I sign a PUT request to "/conversations/me/drafts/eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4"
    When I PUT "/conversations/me/drafts/eNqRUR5nVYf1ud94vt669VYNoqu4gWLuh13N90SVHZ4"
    Then response code is equal to 400

  Scenario Outline: The conversation id draft route does not exist
    Given I have created a one-to-one conversation
    And I set json body
      """
      {
        "encryptedPayload": "sealed-draft-payload"
      }
      """
    And I target an unknown conversation message
    And I sign a <method> request to the current conversation message path "/draft"
    When I send the signed conversation request
    Then response code is equal to 404

    Examples:
      | method |
      | PUT    |
      | DELETE |
