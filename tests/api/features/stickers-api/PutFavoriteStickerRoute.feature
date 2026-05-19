Feature: Put favorite sticker route
  As an API consumer
  I want to favorite and unfavorite stickers
  So that identities can keep a quick-access sticker list

  Scenario: Favorite and unfavorite a sticker
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I remember the current sticker pack
    And I set a static sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 200
    Given I remember the current sticker
    And I sign the current favorite sticker request
    When I PUT the current sticker as favorite
    Then response code is equal to 200
    And response body should contain "favoriteStickers"
    And response body should contain "assetCid"
    Given I sign the current favorite sticker removal request
    When I DELETE the current favorite sticker
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "favoriteStickers": []
      }
      """
