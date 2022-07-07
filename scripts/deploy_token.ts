import hre, { ethers } from 'hardhat';
import '@nomiclabs/hardhat-etherscan';
import chalk from 'chalk';
import fs from 'fs';
import { BigNumber, Contract } from 'ethers';
import ProgressBar from 'progress';
import Web3 from 'web3';

interface DeploymentObject {
    name: string;
    address: string;
    args: any;
    contract: Contract;
}

// custom `deploy` in order to make verifying easier
const deploy = async (contractName: string, _args: any[] = [], overrides = {}, libraries = {}) => {
    console.log(`🛰  Deploying: ${contractName}`);

    const contractArgs: any = _args || [];
    const stringifiedArgs = JSON.stringify(contractArgs);
    const contractArtifacts = await ethers.getContractFactory(contractName, { libraries: libraries });
    const contract = await contractArtifacts.deploy(...contractArgs, overrides);
    const contractAddress = contract.address;
    fs.writeFileSync(`artifacts/${contractName}.address`, contractAddress);
    fs.writeFileSync(`artifacts/${contractName}.args`, stringifiedArgs);

    // tslint:disable-next-line: no-console
    console.log('🌐 Deploying', chalk.cyan(contractName), 'contract to', chalk.magenta(contractAddress));

    await contract.deployed();

    console.log('✅ Deployed', chalk.cyan(contractName), 'contract to', chalk.magenta(contractAddress), '\n');

    const deployed: DeploymentObject = { name: contractName, address: contractAddress, args: contractArgs, contract };

    return deployed;
};

const pause = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

const verifiableNetwork = ['mainnet', 'rinkeby', 'ropsten'];

function makeErrorWrongNetwork() {
    const msg = 'Please switch network to localhost, rinkeby, ropsten, or mainnet';
    console.log(chalk.magenta(msg));
    return Error(msg);
}

async function main() {
    const network = process.env.HARDHAT_NETWORK === undefined ? 'localhost' : process.env.HARDHAT_NETWORK;

    // tslint:disable-next-line: no-console
    console.log('🚀 Deploying to', chalk.magenta(network), '!\n');
    if (network === 'localhost' || network === 'hardhat') {
        const [deployer] = await ethers.getSigners();
        console.log(`Deployer: ${deployer.address}`);

        // tslint:disable-next-line: no-console
        console.log(chalk.cyan('deploying contracts with the account:'), chalk.green(deployer.address));

        // tslint:disable-next-line: no-console
        console.log('Account balance:', (await deployer.getBalance()).toString());
    }

    let contracts: DeploymentObject[] = [];

    // FOO TOKEN
    const FOO_CAP = ethers.utils.parseUnits('500000000', 18);
    const FOO_NAME = 'Foo';
    const FOO_SYMBOL = 'FOO';
    const foo = await deploy('Foo', [FOO_NAME, FOO_SYMBOL, FOO_CAP]);
    contracts.push(foo);

    // verification
    if (verifiableNetwork.includes(network)) {
        let counter = 0;

        // tslint:disable-next-line: no-console
        console.log(
            'Beginning Etherscan verification process...\n',
            chalk.yellow(`WARNING: The process will wait two minutes for Etherscan
        to update their backend before commencing, please wait and do not stop
        the terminal process...`)
        );

        const bar = new ProgressBar('Etherscan update: [:bar] :percent :etas', {
            total: 50,
            complete: '\u2588',
            incomplete: '\u2591',
        });

        // two minute timeout to let Etherscan update
        const timer = setInterval(() => {
            bar.tick();
            if (bar.complete) {
                clearInterval(timer);
            }
        }, 2300);

        await pause(120000);

        // tslint:disable-next-line: no-console
        console.log(chalk.cyan('\n🔍 Running Etherscan verification...'));

        await Promise.all(
            contracts.map(async (contract) => {
                // tslint:disable-next-line: no-console
                console.log(`Verifying ${contract.name}...`);
                try {
                    await hre.run('verify:verify', {
                        address: contract.address,
                        constructorArguments: contract.args,
                    });
                    // tslint:disable-next-line: no-console
                    console.log(chalk.cyan(`✅ ${contract.name} verified!`));
                } catch (error) {
                    // tslint:disable-next-line: no-console
                    console.warn(chalk.yellow(error));
                }
            })
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        // tslint:disable-next-line: no-console
        console.error(error);
        process.exit(1);
    });
