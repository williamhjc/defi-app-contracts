// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
// import "hardhat/console.sol";

contract NFTLoan {
    error InvalidAddress();
    error NotNFTOwner();
    error NotLoanOwner();
    error NotLiquidatable();
    error NoActiveLoan();
    error InsufficientRepayment();
    error TransferFailed();
    error InsufficientAllowance();

    struct Loan {
        address owner;
        uint256 amount;
    }

    uint256 public constant LOAN_TO_VALUE = 50; // 50% LTV
    uint256 public constant LIQUIDATION_BUFFER = 120; // 120%
    uint256 private constant PRICE_DECIMALS = 8;
    uint256 private constant TOKEN_DECIMALS = 18;

    IERC721 public immutable nft;
    IERC20 public immutable token;
    AggregatorV3Interface public immutable priceFeed;

    mapping(uint256 => Loan) public loans;

    event Deposited(address indexed user, uint256 indexed tokenId, uint256 amount);
    event Repaid(address indexed user, uint256 indexed tokenId, uint256 amount);
    event Liquidated(address indexed liquidator, uint256 indexed tokenId, uint256 totalDebt);

    constructor(address _nft, address _token, address _priceFeed) {
        if (_nft == address(0) || _token == address(0) || _priceFeed == address(0)) {
            revert InvalidAddress();
        }
        
        nft = IERC721(_nft);
        token = IERC20(_token);
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function depositNFT(uint256 tokenId) external {
        if (nft.ownerOf(tokenId) != msg.sender) {
            revert NotNFTOwner();
        }

        // transfer nft
        nft.transferFrom(msg.sender, address(this), tokenId);

        // calculate loan amount
        (, int256 price,,,) = priceFeed.latestRoundData();
        uint256 loanAmount = (uint256(price) * LOAN_TO_VALUE * 10**18) / (100 * 10**8);
        // save load amount
        loans[tokenId] = Loan({
            owner: msg.sender,
            amount: loanAmount
        });
        
        // loan
        if (!token.transfer(msg.sender, loanAmount)) {
            revert TransferFailed();
        }

        emit Deposited(msg.sender, tokenId, loanAmount);
    }

    function repayLoan(uint256 tokenId) external {
        Loan memory loan = loans[tokenId];
        if (loan.owner != msg.sender) {
            revert NotLoanOwner();
        }

        uint256 repaymentAmount = loan.amount;

        // Check and transfer repayment funds
        if (token.allowance(msg.sender, address(this)) < repaymentAmount) {
            revert InsufficientRepayment();
        }
        
        if (!token.transferFrom(msg.sender, address(this), repaymentAmount)) {
            revert TransferFailed();
        }

        // return NFT
        nft.transferFrom(address(this), msg.sender, tokenId);
        delete loans[tokenId];

        emit Repaid(msg.sender, tokenId, repaymentAmount);
    }

    function liquidate(uint256 tokenId) external {
        Loan memory loan = loans[tokenId];
        if (loan.owner == address(0)) revert NoActiveLoan();

        // get NFT current price（USD）
        (, int256 price,,,) = priceFeed.latestRoundData();
        uint256 currentValue = uint256(price) * 10**10; // Chainlink 8 decimals
        
        // calculate the lowest safe price: loanAmount * LIQUIDATION_BUFFER / 100
        uint256 minSafeValue = (loan.amount * LIQUIDATION_BUFFER) / 100;
        // console.log("minSafeValue: %s, currentValue: %s", minSafeValue, currentValue);
        
        // check if will liquidate
        if (currentValue >= minSafeValue) {
            revert NotLiquidatable();
        }
        
        // 1. Liquidation penalty (5% extra)
        uint256 penalty = loan.amount * 5 / 100;
        uint256 totalDebt = loan.amount + penalty;
        
        if (token.allowance(msg.sender, address(this)) < totalDebt) {
            revert InsufficientAllowance();
        } 

        if (!token.transferFrom(msg.sender, address(this), totalDebt)) {
            revert TransferFailed();
        }

        // 2. Transfer ownership of the NFT to the liquidator
        nft.safeTransferFrom(address(this), msg.sender, tokenId);
        
        // 3. Destruction of debt records
        delete loans[tokenId];
        
        // 4. Reward liquidator (5% of the totalDebt)
        uint256 reward = totalDebt / 20; 

        if (reward > 0 && token.balanceOf(address(this)) >= reward) {
            if (!token.transfer(msg.sender, reward)) {
                revert TransferFailed();
            }
        }

        emit Liquidated(msg.sender, tokenId, totalDebt);
    }
}