// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract KIOSERC20 is ERC20 {
    constructor(address owner_) ERC20("KIOS", "KIOS") {
        _mint(owner_, 1e10 * 1e18);
    }
}
