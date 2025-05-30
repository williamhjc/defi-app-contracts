// SPDX-License-Identifier: MIT
    pragma solidity ^0.8.20;

    import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
    import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
    import "hardhat/console.sol";

    /// @title LeverageTrade - A contract for 2x leverage long/short trading
    /// @notice Enables users to open, close, and liquidate leveraged positions with Chainlink price feeds
    contract LeverageTrade {
        // Custom errors
        error InsufficientBalance(uint256 required, uint256 available);
        error InsufficientAllowance(uint256 required, uint256 allowed);
        error InvalidMarginAmount();
        error NoPosition();
        error NotLiquidatable();
        error InvalidPrice();
        error InvalidLeverage(uint256 leverage);
        error InsufficientLiquidity(uint256 required, uint256 available);
        error TransferFailed();
        error FeeReserveAlreadyInitialized();

        // Position struct
        struct Position {
            bool isLong; // Long or short
            uint128 margin; // Margin in tokenB
            uint128 size; // Position size (margin * leverage)
            uint256 openPrice; // Average opening price
            uint256 lastUpdated; // Timestamp of last update
        }

        // Constants
        uint256 public constant FEE_RATE = 10; // 0.1% (10000 = 100%)
        uint256 public constant MAINTENANCE_MARGIN = 500; // 5% (10000 = 100%)
        uint256 public constant LIQUIDATION_REWARD = 500; // 5% (10000 = 100%)
        uint256 private constant PRECISION = 1e18; // Precision for calculations
        uint256 private constant MIN_LEVERAGE = 2; // Minimum leverage
        uint256 private constant MAX_LEVERAGE = 50; // Maximum leverage

        // Immutables
        IERC20 public immutable tokenA; // ETH-like token
        IERC20 public immutable tokenB; // USDC-like token
        AggregatorV3Interface public immutable priceFeed;

        // State
        mapping(address => Position) private positions;
        uint256 public feeReserve; // Accumulated fees in tokenB
        bool public isFeeReserveInitialized;
        address public owner;

        // Events
        event PositionOpened(
            address indexed user,
            bool indexed isLong,
            uint256 margin,
            uint256 size,
            uint256 price,
            uint256 leverage
        );
        event PositionIncreased(address indexed user, uint256 margin, uint256 size, uint256 avgPrice);
        event PositionClosed(address indexed user, uint256 profit, uint256 loss);
        event PositionLiquidated(address indexed user, uint256 margin, address indexed liquidator);

        modifier onlyOwner() {
            require(msg.sender == owner, "Not owner");
            _;
        }

        /// @notice Constructor to initialize tokens and price feed
        /// @param _tokenA Address of tokenA (ETH-like)
        /// @param _tokenB Address of tokenB (USDC-like)
        /// @param _priceFeed Address of Chainlink price feed
        constructor(address _tokenA, address _tokenB, address _priceFeed) {
            tokenA = IERC20(_tokenA);
            tokenB = IERC20(_tokenB);
            priceFeed = AggregatorV3Interface(_priceFeed);
            owner = msg.sender;
        }
    
        function initializeFeeReserve(uint256 amount) external onlyOwner {
            if (isFeeReserveInitialized) revert FeeReserveAlreadyInitialized();
            if (!tokenB.transferFrom(msg.sender, address(this), amount)) {
                revert TransferFailed();
            }
            feeReserve += amount;
            isFeeReserveInitialized = true;
        }

        /// @notice Open or increase a leveraged position
        /// @param marginAmount Total margin including fee
        /// @param isLong True for long, false for short
        /// @param leverage Leverage multiplier (2-50)
        function openPosition(uint256 marginAmount, bool isLong, uint256 leverage) external {
            if (marginAmount == 0) revert InvalidMarginAmount();
            if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) revert InvalidLeverage(leverage);
            uint256 balance = tokenB.balanceOf(msg.sender);
            if (balance < marginAmount) revert InsufficientBalance(marginAmount, balance);
            uint256 allowance = tokenB.allowance(msg.sender, address(this));
            if (allowance < marginAmount) revert InsufficientAllowance(marginAmount, allowance);

            // Cache price
            uint256 price = getPrice();

            // Calculate fee and net margin
            uint256 size = marginAmount * leverage;
            uint256 fee = (size * FEE_RATE) / 10000;
            uint256 netMargin = marginAmount - fee;
            size = netMargin * leverage; // Adjust size

            // Update position before external call
            Position storage pos = positions[msg.sender];
            if (pos.margin == 0) {
                _openNewPosition(msg.sender, isLong, netMargin, size, price, leverage);
            } else if (pos.isLong == isLong) {
                _increasePosition(msg.sender, netMargin, size, price);
            } else {
                _closePosition(msg.sender, price);
                _openNewPosition(msg.sender, isLong, netMargin, size, price, leverage);
            }

            // Transfer margin (includes fee)
            if (!tokenB.transferFrom(msg.sender, address(this), marginAmount)) {
                revert TransferFailed();
            }
            feeReserve += fee;
        }

        /// @notice Close user's position
        function closePosition() external {
            Position storage pos = positions[msg.sender];
            if (pos.margin == 0) revert NoPosition();
            _closePosition(msg.sender, getPrice());
        }

        /// @notice Liquidate underfunded position
        /// @param user Address of the user
        function liquidate(address user) external {
            Position storage pos = positions[user];
            if (pos.margin == 0) revert NoPosition();

            // Check liquidation
            uint256 price = getPrice();
            int256 pnl = _calculatePnL(pos.isLong, pos.size, price, pos.openPrice);
            uint256 equity = pnl >= 0 ? pos.margin + uint256(pnl) : (pos.margin > uint256(-pnl) ? pos.margin - uint256(-pnl) : 0);

            uint256 requiredMargin = (pos.margin * MAINTENANCE_MARGIN) / 10000;
            if (equity > requiredMargin) revert NotLiquidatable();

            // Calculate final margin
            uint256 finalMargin = equity;
            uint256 reward = (pos.margin * LIQUIDATION_REWARD) / 10000;

            // Clear position
            delete positions[user];

            // Transfer equity and reward
            if (finalMargin > 0) {
                uint256 available = tokenB.balanceOf(address(this));
                if (available < finalMargin) revert InsufficientLiquidity(finalMargin, available);
                if (!tokenB.transfer(msg.sender, finalMargin)) {
                    revert TransferFailed();
                }
            }

            // console.log("reward ", reward / 10**18);
            // console.log("feeReserve ", feeReserve / 10**18);

            if (reward > 0 && feeReserve >= reward) {
                feeReserve -= reward;
                if (!tokenB.transfer(msg.sender, reward)) {
                    revert TransferFailed();
                }
            }

            emit PositionLiquidated(user, pos.margin, msg.sender);
        }

        /// @notice Get position details
        /// @param user Address of the user
        /// @return isLong True if position is long
        /// @return margin Margin in tokenB
        /// @return size Position size in USD
        /// @return openPrice Average opening price
        /// @return equity Current equity in tokenB
        function getPosition(address user) external view returns (
            bool isLong,
            uint256 margin,
            uint256 size,
            uint256 openPrice,
            uint256 equity
        ) {
            Position storage pos = positions[user];
            uint256 price = getPrice();
            uint256 equityValue = pos.margin + uint256(_calculatePnL(pos.isLong, pos.size, price, pos.openPrice));
            return (pos.isLong, pos.margin, uint256(pos.size), pos.openPrice, equityValue);
        }

        /// @notice Get latest price from Chainlink
        /// @return price Price in USD, adjusted to 18 decimals
        function getPrice() public view returns (uint256 price) {
            (, int256 priceData,,,) = priceFeed.latestRoundData();
            if (priceData <= 0) revert InvalidPrice();
            price = uint256(priceData) * (PRECISION / 1e8); // Adjust to 18 decimals
        }

        /// @notice Internal function to open new position
        function _openNewPosition(
            address user,
            bool isLong,
            uint256 margin,
            uint256 size,
            uint256 price,
            uint256 leverage
        ) internal {
            Position storage pos = positions[user];
            pos.isLong = isLong;
            pos.margin = uint128(margin);
            pos.size = uint128(size);
            pos.openPrice = price;
            pos.lastUpdated = block.timestamp;

            emit PositionOpened(user, isLong, margin, size, price, leverage);
        }

        /// @notice Internal function to increase position
        function _increasePosition(address user, uint256 margin, uint256 size, uint256 price) internal {
            Position storage pos = positions[user];
            uint256 oldMargin = pos.margin;
            uint256 oldSize = pos.size;
            uint256 oldPrice = pos.openPrice;

            // Update margin and size
            uint256 newMargin = oldMargin + margin;
            uint256 newSize = oldSize + size;

            // Calculate average price
            uint256 avgPrice = (oldSize * oldPrice + size * price) / newSize;

            // Update position
            pos.margin = uint128(newMargin);
            pos.size = uint128(newSize);
            pos.openPrice = avgPrice;
            pos.lastUpdated = block.timestamp;

            emit PositionIncreased(user, margin, size, avgPrice);
        }

        /// @notice Internal function to close position
        function _closePosition(address user, uint256 price) internal {
            Position storage pos = positions[user];
            uint256 margin = pos.margin;
            uint256 size = pos.size;
            bool isLong = pos.isLong;

            // Calculate P&L
            int256 pnl = _calculatePnL(isLong, size, price, pos.openPrice);

            // Adjust margin
            uint256 finalMargin;
            if (pnl >= 0) {
                finalMargin = margin + uint256(pnl);
                emit PositionClosed(user, uint256(pnl), 0);
            } else {
                uint256 loss = uint256(-pnl);
                finalMargin = margin > loss ? margin - loss : 0;
                emit PositionClosed(user, 0, loss);
            }

            // Charge fee
            uint256 fee = (size * FEE_RATE) / 10000;
            if (fee > 0) {
                finalMargin = finalMargin > fee ? finalMargin - fee : 0;
                feeReserve += fee;
            }

            // Transfer margin
            if (finalMargin > 0) {
                uint256 available = tokenB.balanceOf(address(this));
                if (available < finalMargin) revert InsufficientLiquidity(finalMargin, available);
                if (!tokenB.transfer(user, finalMargin)) {
                    revert TransferFailed();
                }
            }

            // Clear position
            delete positions[user];
        }

        /// @notice Calculate profit and loss
        function _calculatePnL(
            bool isLong,
            uint256 size,
            uint256 currentPrice,
            uint256 openPrice
        ) internal pure returns (int256 pnl) {
            if (isLong) {
                pnl = int256((size * currentPrice) / openPrice) - int256(size);
            } else {
                pnl = int256(size) - int256((size * currentPrice) / openPrice);
            }
        }
    }