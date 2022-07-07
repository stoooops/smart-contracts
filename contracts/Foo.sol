//SPDX-License-Identifier: Unlicense
//
pragma solidity ^0.8.15;
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./IFoo.sol";

/** @title FOO token
 */
contract Foo is
    IFoo,
    ERC20Capped,
    Ownable,
    ERC20Burnable
{
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 cap_
    ) ERC20(name_, symbol_) ERC20Capped(cap_) {}

    /** @notice Allows owner to mint new tokens
     * @param account The address to receive minted tokens
     * @param amount The amount of new tokens to mint
     */
    function mint(address account, uint256 amount) public override onlyOwner {
        _mint(account, amount);
    }

    function _mint(address account, uint256 amount)
        internal
        override(ERC20, ERC20Capped)
    {
        super._mint(account, amount);
    }
}
