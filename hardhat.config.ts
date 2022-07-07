import { task } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import { HardhatUserConfig } from 'hardhat/types';
import * as dotenv from "dotenv";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "solidity-coverage";
dotenv.config();


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [{ version: "0.8.15", settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    } }],
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS === 'true') ? true : false,
    currency: 'USD',
    coinmarketcap: process.env.COINMARKETCAP,
    gasPrice: 50,
    showTimeSpent: true,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  networks: {
    localhost: {
      url: "http://localhost:8545",
      /*
        notice no env vars here? it will just use account 0 of the hardhat node to deploy
        (you can put in a mnemonic here to set the deployer locally)
      */
    },
    // networks without env vars set need to be commented out or they'll crash the script
    // so only uncomment if the .env has been set
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.RINKEBY_INFURA_KEY}`,
      accounts: [`${process.env.RINKEBY_DEPLOYER_PRIV_KEY}`],
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.ROPSTEN_INFURA_KEY}`,
      accounts: [`${process.env.ROPSTEN_DEPLOYER_PRIV_KEY}`],
      gasPrice: 10000000000
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.MAINNET_INFURA_KEY}`,
      accounts: [`${process.env.MAINNET_DEPLOYER_PRIV_KEY}`],
      gasMultiplier: 1.25
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
