// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "loyalty-tokens/contracts/LoyaltyToken.sol";

contract ACC is LoyaltyToken {
    /*
     * Public functions
     */
    constructor(address account_) LoyaltyToken("ACC Coin", "ACC", account_) {}
}
