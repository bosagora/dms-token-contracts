// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "loyalty-tokens/contracts/LoyaltyToken.sol";

contract KIOS is LoyaltyToken {
    /*
     * Public functions
     */
    constructor(address account_, address feeAccount_) LoyaltyToken("KIOS", "KIOS", account_, feeAccount_) {}
}
