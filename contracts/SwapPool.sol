// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract SwapPool {
    error InsufficientLiquidity();
    error SlippageTooHigh();
    error InsufficientReserveB();
    error TransferFailed();

    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;

    event Swap(address indexed sender, uint256 amountIn, uint256 amountOut);

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
    }

    function swap(uint256 amountA, uint256 minAmountB) external returns (uint256 amountB) {
        if (reserveA <= 0 && reserveB <= 0) {
            revert InsufficientLiquidity();
        } 

        amountB = Math.mulDiv(amountA, reserveB, reserveA);
        if (amountB < minAmountB) {
            revert SlippageTooHigh();
        }

        if (amountB > reserveB) {
            revert InsufficientReserveB();
        }
        
        if (!tokenA.transferFrom(msg.sender, address(this), amountA)) {
            revert TransferFailed();
        }
        if (!tokenB.transfer(msg.sender, amountB)) {
            revert TransferFailed();
        }
        reserveA += amountA;
        reserveB -= amountB;

        emit Swap(msg.sender, amountA, amountB);
    }
}