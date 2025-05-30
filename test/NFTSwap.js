const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Token and Swap Pool Test", function () {
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18);
  const LIQUIDITY_AMOUNT = ethers.parseUnits("1000", 18);

  async function setupFixture() {
    [owner] = await ethers.getSigners();

    const [tokenA, tokenB] = await Promise.all([
      ethers.deployContract("TokenA"),
      ethers.deployContract("TokenB")
    ]);

    const swapPool = await ethers.deployContract("SwapPool", [
      tokenA.target,
      tokenB.target
    ]);

    return { tokenA, tokenB, swapPool, owner };
  }

  describe("Token Deployment", function () {
    it("Should assign initial supply to deployer", async function () {
      const { tokenA, tokenB, owner } = await loadFixture(setupFixture);
      
      const results = await Promise.all([
        tokenA.balanceOf(owner.address),
        tokenB.balanceOf(owner.address)
      ]);

      expect(results[0]).to.equal(INITIAL_SUPPLY);
      expect(results[1]).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Swap Pool Functionality", function () {
    async function setupWithLiquidity() {
      const fixture = await loadFixture(setupFixture);
      
      await Promise.all([
        fixture.tokenA.approve(fixture.swapPool.target, LIQUIDITY_AMOUNT),
        fixture.tokenB.approve(fixture.swapPool.target, LIQUIDITY_AMOUNT)
      ]);

      await fixture.swapPool.addLiquidity(LIQUIDITY_AMOUNT, LIQUIDITY_AMOUNT);
      return fixture;
    }

    it("Should add liquidity correctly", async function () {
      const { tokenA, tokenB, swapPool } = await loadFixture(setupWithLiquidity);

      const [balanceA, balanceB, reserves] = await Promise.all([
        tokenA.balanceOf(swapPool.target),
        tokenB.balanceOf(swapPool.target),
        Promise.all([swapPool.reserveA(), swapPool.reserveB()])
      ]);

      expect(balanceA).to.equal(LIQUIDITY_AMOUNT);
      expect(balanceB).to.equal(LIQUIDITY_AMOUNT);
      expect(reserves).to.deep.equal([LIQUIDITY_AMOUNT, LIQUIDITY_AMOUNT]);
    });

    it("Should swap tokens correctly", async function () {
      const { tokenA, tokenB, swapPool, owner } = await loadFixture(setupWithLiquidity);
      const SWAP_AMOUNT = ethers.parseUnits("100", 18);
      const MIN_AMOUNTB = ethers.parseUnits("10", 18);

      // get base balance
      const initialBalanceA = await tokenA.balanceOf(owner.address);
      const initialBalanceB = await tokenB.balanceOf(owner.address);
      await tokenA.approve(swapPool.target, SWAP_AMOUNT);
      
      const expectedAmountB = await swapPool.swap.staticCall(SWAP_AMOUNT, MIN_AMOUNTB);
      
      const tx = await swapPool.swap(SWAP_AMOUNT, MIN_AMOUNTB);
      await expect(tx)
        .to.emit(swapPool, "Swap")
        .withArgs(owner.address, SWAP_AMOUNT, expectedAmountB);

      const finalBalanceB = await tokenB.balanceOf(owner.address);
      expect(finalBalanceB - initialBalanceB).to.equal(expectedAmountB);

      const finalBalanceA = await tokenA.balanceOf(owner.address);
      expect(initialBalanceA - finalBalanceA).to.equal(SWAP_AMOUNT);
    });
  });
});

describe("NFTLoan", function () {
  async function deployContracts() {
    const [owner, user1, user2] = await ethers.getSigners();
    
    const [nft, token, priceFeed] = await Promise.all([
      ethers.deployContract("NFTCollateral"),
      ethers.deployContract("TokenB"),
      ethers.deployContract("MockV3Aggregator", [8, 1000 * 10 ** 8]) // base price 1000 USD
    ]);

    const loan = await ethers.deployContract("NFTLoan", [nft.target, token.target, priceFeed.target]);

    await Promise.all([
      nft.mint(user1.address), // NFT ID 1
      token.transfer(user1.address, ethers.parseEther("1000")),
      token.transfer(loan.target, ethers.parseEther("1000")) 
    ]);

    return { nft, token, priceFeed, loan, owner, user1, user2 };
  }

  async function setupWithLoan() {
    const fixture = await loadFixture(deployContracts);
    await fixture.nft.connect(fixture.user1).approve(fixture.loan.target, 1);
    await fixture.loan.connect(fixture.user1).depositNFT(1);
    return fixture;
  }

  describe("Constructor", function () {
    it("should initialize contracts correctly", async function () {
      const { nft, token, priceFeed, loan } = await loadFixture(deployContracts);
      
      const [nftAddr, tokenAddr, feedAddr, ltv] = await Promise.all([
        loan.nft(),
        loan.token(),
        loan.priceFeed(),
        loan.LOAN_TO_VALUE()
      ]);

      expect(nftAddr).to.equal(nft.target);
      expect(tokenAddr).to.equal(token.target);
      expect(feedAddr).to.equal(priceFeed.target);
      expect(ltv).to.equal(50);
    });
  });

  describe("depositNFT", function () {
    it("should deposit NFT and issue loan", async function () {
      const { nft, token, loan, user1 } = await loadFixture(deployContracts);
      
      await nft.connect(user1).approve(loan.target, 1);
      
      const tx = loan.connect(user1).depositNFT(1);
      await expect(tx)
        .to.emit(loan, "Deposited") 
        .withArgs(user1.address, 1, ethers.parseEther("500")); // 1000 * 50%

      // 并行检查状态
      const [owner, loanInfo, userBalance] = await Promise.all([
        nft.ownerOf(1),
        loan.loans(1),
        token.balanceOf(user1.address)
      ]);

      expect(owner).to.equal(loan.target);
      expect(loanInfo.owner).to.equal(user1.address);
      expect(loanInfo.amount).to.equal(ethers.parseEther("500"));
      expect(userBalance).to.equal(ethers.parseEther("1500")); // initial(1000) + 500
    });

    it("should reject non-owner deposits", async function () {
      const { loan, user2 } = await loadFixture(deployContracts);
      await expect(loan.connect(user2).depositNFT(1))
        .to.be.revertedWithCustomError(loan, "NotNFTOwner");
    });
  });

  describe("repayLoan", function () {
    it("should repay full loan and return NFT", async function () {
      const { nft, token, loan, user1 } = await loadFixture(setupWithLoan);
      const loanAmount = ethers.parseEther("500");
      
      await token.connect(user1).approve(loan.target, loanAmount);
      
      await expect(loan.connect(user1).repayLoan(1))
        .to.emit(loan, "Repaid")
        .withArgs(user1.address, 1, loanAmount);

      const [nftOwner, loanExists] = await Promise.all([
        nft.ownerOf(1),
        loan.loans(1)
      ]);
      
      expect(nftOwner).to.equal(user1.address);
      expect(loanExists.amount).to.equal(0);
    });

    it("should reject repayment with insufficient funds", async function () {
      const { token, loan, user1 } = await loadFixture(setupWithLoan);
      
      await token.connect(user1).transfer(owner.address, ethers.parseEther("1000"));
      
      await expect(loan.connect(user1).repayLoan(1))
        .to.be.revertedWithCustomError(loan, "InsufficientRepayment")
    });

    it("should reject repayment by non-borrower", async function () {
      const { loan, user2 } = await loadFixture(setupWithLoan);
      await expect(loan.connect(user2).repayLoan(1))
        .to.be.revertedWithCustomError(loan, "NotLoanOwner");
    });
  });
  
  describe("liquidate", function () {
    it("should NOT liquidate when value is above safety threshold", async () => {
      const { loan, priceFeed } = await loadFixture(setupWithLoan);

      // Stake NFTs worth 1,000 USD and borrow 500 USD
      // NFT price drops to $700 (still 600 USD above the liquidation line)
      await priceFeed.updateAnswer(700 * 1e8);
      
      await expect(loan.liquidate(1))
        .to.be.revertedWithCustomError(loan, "NotLiquidatable");
    });

    it("should liquidate when value drops below threshold", async () => {
      const { nft, loan, priceFeed, user2, token } = await loadFixture(setupWithLoan);
      token.transfer(user2, ethers.parseEther("525"));
      await token.connect(user2).approve(loan.target, ethers.parseEther("525"));
      
      // NFT price drops to $500 ($600 below the liquidation line)
      await priceFeed.updateAnswer(500 * 1e8);
      
       // user2 execute liquidate
      const tx = loan.connect(user2).liquidate(1);
      
      // check event and status
      await expect(tx)
        .to.emit(loan, "Liquidated")
        .withArgs(
          user2.address, 
          1, 
          ethers.parseEther("525") // 500 + 5%
        );
      
      // check NFT owner
      expect(await nft.ownerOf(1)).to.equal(user2.address);
    });

    it("should reject premature liquidation", async function () {
      const { loan } = await loadFixture(setupWithLoan);
      await expect(loan.liquidate(1))
        .to.be.revertedWithCustomError(loan, "NotLiquidatable");
    });
  });
});


describe("LeverageTrade", function () {
  // Constants for test setup
  const INITIAL_BALANCE = ethers.parseEther("30000"); // Initial token balances
  const ETH_PRICE = 2000 * 1e8; // $2000 with 8 decimal places (Chainlink format)
  const LEVERAGE = 10; // 10x leverage

  /**
   * @notice Deploys all contracts and sets up initial state
   * @return Deployed contract instances and test accounts
   */
  async function deployContracts() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock tokens (TokenA = WETH-like, TokenB = USDC-like)
    const tokenA = await ethers.deployContract("TokenA");
    
    const tokenB = await ethers.deployContract("TokenB");

    // Deploy mock Chainlink price feed
    const priceFeed = await ethers.deployContract("MockV3Aggregator", [8, ETH_PRICE]);

    // Deploy LeverageTrade contract
    const leverageTrade = await ethers.deployContract("LeverageTrade", [tokenA.target, tokenB.target, priceFeed.target]);
    await tokenB.connect(owner).approve(leverageTrade.target, INITIAL_BALANCE / 3n);
    await leverageTrade.initializeFeeReserve(INITIAL_BALANCE / 3n);

    const feeReserve = await leverageTrade.feeReserve();
    // console.log("Fee Reserve:", feeReserve.toString());
    // Distribute tokens to test users
    await tokenB.transfer(user1.address, INITIAL_BALANCE / 3n);
    await tokenB.transfer(user2.address, INITIAL_BALANCE / 3n);
    // await tokenB.transfer(leverageTrade.target, contractFunding);
    // await tokenB.transfer(leverageTrade.target, INITIAL_BALANCE / 3n);

    return { tokenA, tokenB, priceFeed, leverageTrade, owner, user1, user2 };
  }

  /**
   * @notice Sets up a test environment with an open position
   * @return Fixture with deployed contracts and initial long position
   */
  async function setupWithPosition() {
    const fixture = await loadFixture(deployContracts);
    const noFeeMargin = ethers.parseEther("100"); // $100 margin

    // User1 approves and opens a long position
    await fixture.tokenB.connect(fixture.user1).approve(fixture.leverageTrade.target, noFeeMargin * 2n);
    await fixture.leverageTrade.connect(fixture.user1).openPosition(
      noFeeMargin,
      true, // isLong = true
      LEVERAGE
    );

    return { ...fixture, noFeeMargin };
  }

  // Test suite for contract deployment
  describe("Contract Deployment", function () {
    it("Should initialize contracts correctly", async function () {
      const { tokenA, tokenB, priceFeed, leverageTrade } = await loadFixture(deployContracts);

      // Verify contract addresses are set correctly
      expect(await leverageTrade.tokenA()).to.equal(tokenA.target);
      expect(await leverageTrade.tokenB()).to.equal(tokenB.target);
      expect(await leverageTrade.priceFeed()).to.equal(priceFeed.target);
    });
  });

  // Test suite for position opening
  describe("Position Opening", function () {
    it("Should allow users to open long positions", async function () {
      const { leverageTrade, user1, noFeeMargin } = await loadFixture(setupWithPosition);

      // Verify position details
      const position = await leverageTrade.getPosition(user1.address);
      expect(position.isLong).to.be.true;
      
      // Expected margin after fee deduction: margin - (size * feeRate)
      const expectedMargin = noFeeMargin - (noFeeMargin * BigInt(LEVERAGE) * 10n) / 10000n;
      expect(position.margin).to.equal(expectedMargin);
      
      // Expected size: (margin - fee) * leverage
      const expectedSize = expectedMargin * BigInt(LEVERAGE);
      expect(position.size).to.equal(expectedSize);
    });

    it("Should reject invalid leverage values", async function () {
      const { leverageTrade, user1, tokenB } = await loadFixture(deployContracts);
      const margin = ethers.parseEther("100");

      await tokenB.connect(user1).approve(leverageTrade.target, margin);
      
      // Test leverage below minimum (2x)
      await expect(leverageTrade.connect(user1).openPosition(margin, true, 1))
        .to.be.revertedWithCustomError(leverageTrade, "InvalidLeverage");

      // Test leverage above maximum (50x)
      await expect(leverageTrade.connect(user1).openPosition(margin, true, 51))
        .to.be.revertedWithCustomError(leverageTrade, "InvalidLeverage");
    });

    it("Should reject insufficient margin balance", async function () {
      const { leverageTrade, user1, tokenB } = await loadFixture(deployContracts);
      const margin = ethers.parseEther("10001"); // More than user balance

      await tokenB.connect(user1).approve(leverageTrade.target, margin);
      
      await expect(leverageTrade.connect(user1).openPosition(margin, true, LEVERAGE))
        .to.be.revertedWithCustomError(leverageTrade, "InsufficientBalance");
    });
  });

  // Test suite for position closing
  describe("Position Closing", function () {
    it("Should allow profitable position closing", async function () {
      const { leverageTrade, user1, tokenB, priceFeed, noFeeMargin } = await loadFixture(setupWithPosition);
      const contractFunding = ethers.parseEther("10000");  
      await tokenB.transfer(leverageTrade.target, contractFunding);

      // Simulate 20% price increase
      await priceFeed.updateAnswer(ETH_PRICE * 1.2);

      const initialBalance = await tokenB.balanceOf(user1.address);
      await leverageTrade.connect(user1).closePosition();
      const finalBalance = await tokenB.balanceOf(user1.address);

      // Expected profit: margin * leverage * priceChange - fees
      const netMargin = noFeeMargin - (noFeeMargin * BigInt(LEVERAGE) * 10n) / 10000n;
      const size = netMargin * BigInt(LEVERAGE);
      const pnl = (20n * size) / 100n;
      const expectedProfit = netMargin + pnl - (size / 1000n);
      expect(finalBalance - initialBalance).to.equal(expectedProfit);
    });
  
    it("Should handle loss-making position closing", async function () {
      const { leverageTrade, user1, tokenB, priceFeed } = await loadFixture(setupWithPosition);
      
      // Simulate 10% price decrease
      await priceFeed.updateAnswer(ETH_PRICE * 0.9);

      const initialBalance = await tokenB.balanceOf(user1.address);
      await leverageTrade.connect(user1).closePosition();
      const finalBalance = await tokenB.balanceOf(user1.address);

      // Expected loss: margin * leverage * priceChange + fees
      expect(initialBalance - finalBalance).to.equal(0);
    });

    it("Should reject closing non-existent positions", async function () {
      const { leverageTrade, user2 } = await loadFixture(setupWithPosition);
      
      await expect(leverageTrade.connect(user2).closePosition())
        .to.be.revertedWithCustomError(leverageTrade, "NoPosition");
    });
  });

  // Test suite for liquidation
  describe("Position Liquidation", function () {
    it("Should allow liquidation when below maintenance margin", async function () {
      const { leverageTrade, user1, user2, tokenB, priceFeed, noFeeMargin } = await loadFixture(setupWithPosition);
      const contractFunding = ethers.parseEther("10000");  
      await tokenB.transfer(leverageTrade.target, contractFunding);

      // Simulate 15% price drop (breaching maintenance margin)
      await priceFeed.updateAnswer(ETH_PRICE * 0.85);

      const liquidatorBalance = await tokenB.balanceOf(user2.address);
      await leverageTrade.connect(user2).liquidate(user1.address);
      const netMargin = noFeeMargin - (noFeeMargin * BigInt(LEVERAGE) * 10n) / 10000n;
      const reward = (netMargin * 500n) / 10000n; // 5% liquidation reward
      // console.log("reward: ", reward);
      // Verify liquidator received reward
      expect(await tokenB.balanceOf(user2.address)).to.equal(liquidatorBalance + reward);
    });

    it("Should reject liquidation for healthy positions", async function () {
      const { leverageTrade, user1, user2, priceFeed } = await loadFixture(setupWithPosition);
      
      // Simulate 5% price drop (still above maintenance)
      await priceFeed.updateAnswer(ETH_PRICE * 95);

      await expect(leverageTrade.connect(user2).liquidate(user1.address))
        .to.be.revertedWithCustomError(leverageTrade, "NotLiquidatable");
    });

    it("Should reject liquidation of non-existent positions", async function () {
      const { leverageTrade, user2 } = await loadFixture(setupWithPosition);
      
      await expect(leverageTrade.connect(user2).liquidate(user2.address))
        .to.be.revertedWithCustomError(leverageTrade, "NoPosition");
    });
  });

  // Test suite for price feed handling
  describe("Price Feed Handling", function () {
    it("Should handle zero price reverts", async function () {
      const { leverageTrade, priceFeed } = await loadFixture(deployContracts);
      
      await priceFeed.updateAnswer(0);
      await expect(leverageTrade.getPrice())
        .to.be.revertedWithCustomError(leverageTrade, "InvalidPrice");
    });

    it("Should handle negative price reverts", async function () {
      const { leverageTrade, priceFeed } = await loadFixture(deployContracts);
      
      await priceFeed.updateAnswer(-100);
      await expect(leverageTrade.getPrice())
        .to.be.revertedWithCustomError(leverageTrade, "InvalidPrice");
    });
  });

  // Test suite for position management
  describe("Position Management", function () {
    it("Should allow position size increases", async function () {
      const { leverageTrade, user1, tokenB } = await loadFixture(setupWithPosition);
      
      const additionalMargin = ethers.parseEther("50");
      await tokenB.connect(user1).approve(leverageTrade.target, additionalMargin);
      const oldPosition = await leverageTrade.getPosition(user1.address);
      const oldMargin = oldPosition.margin;

      // Increase existing position
      await leverageTrade.connect(user1).openPosition(
        additionalMargin,
        true, // Same direction
        LEVERAGE
      );

      const position = await leverageTrade.getPosition(user1.address);
      const netMargin = additionalMargin - (additionalMargin * BigInt(LEVERAGE) * 10n) / 10000n;
      const finalMargin = oldMargin + netMargin;
      expect(position.margin).to.equal(finalMargin);
    });

    it("Should auto-close when opening opposite position", async function () {
      const { leverageTrade, user1, tokenB } = await loadFixture(setupWithPosition);
      
      const newMargin = ethers.parseEther("200");
      await tokenB.connect(user1).approve(leverageTrade.target, newMargin);
      
      const initialBalance = await tokenB.balanceOf(user1.address);
      
      // Open opposite (short) position
      await leverageTrade.connect(user1).openPosition(
        newMargin,
        false, // Opposite direction
        LEVERAGE
      );
      
      const finalBalance = await tokenB.balanceOf(user1.address);

      // Verify old position was closed and new one opened
      const position = await leverageTrade.getPosition(user1.address);
      expect(position.isLong).to.be.false;
      expect(finalBalance).to.be.lessThan(initialBalance); // Deducted new margin
    });
  });
});