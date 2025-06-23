// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenA is ERC20 {
    error NotOwner();

    address public immutable i_owner;

     modifier onlyOwner() {
        require(msg.sender == i_owner, "Not owner");
        _;
    }

    constructor() ERC20("Token A", "TKA") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
        i_owner = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}