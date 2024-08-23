// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "multisig-wallet-contracts/contracts/IMultiSigWallet.sol";

import "loyalty-tokens/contracts/BIP20/BIP20DelegatedTransfer.sol";

contract ACC is BIP20DelegatedTransfer {
    /*
     *  Storage
     */

    uint256 public constant MAX_SUPPLY = 1e10 * 1e18;

    /*
     *  Modifiers
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can execute");
        _;
    }

    /*
     * Public functions
     */
    constructor(
        address account_,
        address feeAccount_
    ) BIP20DelegatedTransfer("ACC Coin", "ACC", account_, feeAccount_) {
        require(
            IMultiSigWallet(owner).supportsInterface(type(IMultiSigWallet).interfaceId),
            "ACC: Invalid interface ID of multi sig wallet"
        );
    }

    function mint(uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "ACC: The total supply exceeded maximum and rejected");
        _mint(owner, amount);
    }

    function getOwner() external view returns (address) {
        return owner;
    }
}
