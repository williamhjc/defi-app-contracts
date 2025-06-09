require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    }
    // },
    // sepolia: {
    //   url: `https://api.zan.top/node/v1/eth/sepolia/${process.env.ZAN_API_KEY}`,
    //   accounts: [process.env.SEPOLIA_PRIVATE_KEY],
    // }
  }
};
