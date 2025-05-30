// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFTCollateral is ERC721 {
    error MaxSupplyReached();
    uint256 public constant MAX_SUPPLY = 1000;
    
    uint256 private _totalSupply;
    uint256 private _tokenIdCounter;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() ERC721("NFTCollateral", "NFTC") {
        owner = msg.sender;
    }

    function mint(address to) external onlyOwner {
        if(_totalSupply >= MAX_SUPPLY) {
            revert MaxSupplyReached();
        } 

        _tokenIdCounter++;
        _safeMint(to, _tokenIdCounter);
        _totalSupply++;
    }
}