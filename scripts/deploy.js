const hre = require("hardhat");

async function main() {
  // Deploy TokenA 
  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const tokenA = await TokenA.deploy();
  await tokenA.waitForDeployment(); // 等待部署完成
  console.log("TokenA deployed to:", await tokenA.getAddress()); // 或用 tokenA.target

  // Deploy TokenB 
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const tokenB = await TokenB.deploy();
  await tokenB.waitForDeployment();
  console.log("TokenB deployed to:", await tokenB.getAddress());

  // Deploy NFTCollateral 
  const NFTCollateral = await hre.ethers.getContractFactory("NFTCollateral");
  const nftCollateral = await NFTCollateral.deploy();
  await nftCollateral.waitForDeployment();
  console.log("NFTCollateral deployed to:", await nftCollateral.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});