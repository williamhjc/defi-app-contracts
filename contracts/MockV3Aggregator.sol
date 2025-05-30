// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockV3Aggregator {
    uint8 public decimals;
    int256 public latestAnswer;
    address public owner;

    event PriceUpdated(int256 newPrice);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint8 _decimals, int256 _initialAnswer) {
        decimals = _decimals;
        latestAnswer = _initialAnswer;
        owner = msg.sender;
    }

    function updateAnswer(int256 _answer) public onlyOwner {
        latestAnswer = _answer;
        emit PriceUpdated(_answer);
    }

    function latestRoundData()
        public
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, latestAnswer, 0, 0, 0);
    }
}