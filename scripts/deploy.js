async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deploy account:", deployer.address);

  // deploy TokenA 和 TokenB
  const tokenA = await ethers.deployContract("TokenA");
  console.log("TokenA deployed address:", tokenA.target);

  const tokenB = await ethers.deployContract("TokenB");
  console.log("TokenB deployed address:", tokenB.target);

  // deploy MockV3Aggregator
  const ETH_PRICE = 2000 * 1e8;
  const priceFeed = await ethers.deployContract("MockV3Aggregator", [8, ETH_PRICE]);
  console.log("MockV3Aggregator deployed address:", priceFeed.target);

  // deploy LeverageTrade
  const INITIAL_BALANCE = ethers.parseEther("10000");
  const leverageTrade = await ethers.deployContract("LeverageTrade", [tokenA.target, tokenB.target, priceFeed.target]);
  await tokenB.connect(deployer).approve(leverageTrade.target, INITIAL_BALANCE);
  await leverageTrade.initializeFeeReserve(INITIAL_BALANCE);
  console.log("LeverageTrade deployed address:", leverageTrade.target);

  // deploy NFTCollateral
  const nftCollateral = await ethers.deployContract("NFTCollateral");
  console.log("NFTCollateral deployed address:", nftCollateral.target);

  // deploy NFTLoan
  const nftLoan = await ethers.deployContract("NFTLoan", [nftCollateral.target, tokenB.target, priceFeed.target]);
  console.log("NFTLoan deployed address:", nftLoan.target);

  // deploy SwapPool
  const swapPool = await ethers.deployContract("SwapPool", [tokenA.target, tokenB.target]);
  console.log("SwapPool deployed address:", swapPool.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
