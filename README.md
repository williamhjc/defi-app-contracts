# Project Introduction

This project is a comprehensive decentralized finance (DeFi) platform built on the Ethereum blockchain, specifically designed for the Sepolia testnet. It integrates several key functionalities to provide users with a versatile toolkit for managing digital assets and engaging in advanced trading strategies.

## Key Features:

1. **Leveraged Trading (LeverageTrade Contract):**
   - Allows users to open long or short positions with leverage ranging from 2x to 50x.
   - Utilizes Chainlink's price feeds for real-time price data.
   - Includes mechanisms for margin management, position liquidation, and fee collection, with a 0.1% fee on position size, 5% maintenance margin requirement, and 5% liquidation reward.
2. **NFT-Based Collateral Loans (NFTCollateral and NFTLoan Contracts):**
   - Users can mint up to 1000 unique NFTs and use them as collateral to secure loans in TokenB.
   - Loans are issued with a 50% loan-to-value (LTV) ratio and a 120% liquidation buffer to protect lenders.
   - Features include loan origination, repayment, and liquidation of undercollateralized positions.
3. **Token Swapping (SwapPool Contract):**
   - Facilitates the exchange of TokenA and TokenB with built-in slippage protection.
   - Supports liquidity provision, allowing users to add liquidity to the pool and earn trading fees.

## Supporting Contracts:

- **TokenA and TokenB:** Custom ERC20 tokens used within the platform for trading and swapping.
- **MockV3Aggregator:** A mock Chainlink aggregator for testing price feed integrations during development.

## Purpose:

The platform aims to provide a seamless and integrated environment where users can leverage their assets, utilize NFTs as collateral, and swap tokens efficiently. By combining these features, the project offers a holistic approach to DeFi, enabling users to maximize their financial strategies while managing risks through built-in mechanisms like liquidation and slippage controls.

## Technical Stack:

- **Blockchain:** Ethereum (Sepolia testnet)
- **Development Framework:** Hardhat
- **Libraries:** OpenZeppelin Contracts, Chainlink
- **Frontend:** React.js with MetaMask integration
- **Deployment:** Vercel for frontend, Sepolia for smart contracts

## Future Developments:

- Transition to the Ethereum mainnet for real-world usage.
- Expansion of supported assets and trading pairs.
- Introduction of additional features such as yield farming and decentralized governance.

This project represents a significant step forward in the DeFi space, offering a unified platform that combines leveraged trading, NFT collateralization, and token swapping into a single, user-friendly ecosystem. It leverages the transparency and security of blockchain technology to empower users with greater control over their financial activities.
