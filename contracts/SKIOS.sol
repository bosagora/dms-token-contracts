// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SKIOS is ERC20 {
    constructor(address owner_) ERC20("SKIOS", "SKIOS") {
        _mint(owner_, 2e9 * 1e18);
    }
}
