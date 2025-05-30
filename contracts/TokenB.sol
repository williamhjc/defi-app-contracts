// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenB is ERC20 {
    error NotOwner();

    address public owner;

     modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() ERC20("Token B", "TKB") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
        owner = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}