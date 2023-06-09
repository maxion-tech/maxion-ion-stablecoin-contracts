import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.7",
  networks: {
    bscTestnet: {
      accounts: [process.env.PRIVATE_KEY as string],
      chainId: 97,
      url: process.env.BSC_TESTNET_URL
    },
    bsc: {
      accounts: [],
      chainId: 56,
      url: process.env.BSC_MAINNET_URL
    }
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.ETHERSCAN_API_KEY as string,
      bsc: process.env.ETHERSCAN_API_KEY as string
    }
  }
};

export default config;
