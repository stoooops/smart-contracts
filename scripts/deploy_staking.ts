import hre, { ethers } from 'hardhat';
import '@nomiclabs/hardhat-etherscan';
import chalk from 'chalk';
import fs from 'fs';
import { Contract } from 'ethers';
import ProgressBar from 'progress';

interface DeploymentObject {
    name: string;
    address: string;
    args: any;
    contract: Contract;
}

function makeErrorWrongNetwork() {
    const msg = 'Please switch network to localhost, rinkeby, or mainnet';
    console.log(chalk.magenta(msg));
    return Error(msg);
}

// custom `deploy` in order to make verifying easier
const deploy = async (contractName: string, _args: any[] = [], overrides = {}, libraries = {}) => {
    console.log(` 🛰  Deploying: ${contractName}`);

    const contractArgs: any = _args || [];
    const stringifiedArgs = JSON.stringify(contractArgs);
    const contractArtifacts = await ethers.getContractFactory(contractName, { libraries: libraries });
    const contract = await contractArtifacts.deploy(...contractArgs, overrides);
    const contractAddress = contract.address;
    fs.writeFileSync(`artifacts/${contractName}.address`, contractAddress);
    fs.writeFileSync(`artifacts/${contractName}.args`, stringifiedArgs);

    // tslint:disable-next-line: no-console
    console.log('Deploying', chalk.cyan(contractName), 'contract to', chalk.magenta(contractAddress));

    await contract.deployed();

    const deployed: DeploymentObject = { name: contractName, address: contractAddress, args: contractArgs, contract };

    return deployed;
};

const pause = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

const verifiableNetwork = ['mainnet', 'rinkeby', 'ropsten'];

async function main() {
    const network = process.env.HARDHAT_NETWORK === undefined ? 'localhost' : process.env.HARDHAT_NETWORK;

    // tslint:disable-next-line: no-console
    console.log('🚀 Deploying to', chalk.magenta(network), '!');
    if (
        network === 'localhost' ||
        network === 'hardhat' ||
        network === 'rinkeby' ||
        network === 'ropsten' ||
        network === 'mainnet'
    ) {
        const [deployer] = await ethers.getSigners();

        // tslint:disable-next-line: no-console
        console.log(chalk.cyan('deploying contracts with the account:'), chalk.green(deployer.address));

        // tslint:disable-next-line: no-console
        console.log('Account balance:', (await deployer.getBalance()).toString());
    }

    // validation
    let FOOAddress: string | undefined;
    switch (network) {
        case 'localhost':
            break;
        case 'rinkeby':
            if (process.env.RINKEBY_FOO_ADDRESS === '') {
                throw new Error('rinkeby FOO address not set');
            }
            FOOAddress = process.env.RINKEBY_FOO_ADDRESS;
            break;
        case 'ropsten':
            if (process.env.ROPSTEN_FOO_ADDRESS === '') {
                throw new Error('ropsten FOO address not set');
            }
            FOOAddress = process.env.ROPSTEN_FOO_ADDRESS;
            break;
        case 'mainnet':
            if (process.env.MAINNET_FOO_ADDRESS === '') {
                throw new Error('mainnet FOO address not set');
            }
            FOOAddress = process.env.MAINNET_FOO_ADDRESS;
            break;
        default:
            throw makeErrorWrongNetwork();
    }
    if (FOOAddress === undefined || FOOAddress.length == 0) {
        throw new Error('Empty FOOAddress');
    }

    let contracts: DeploymentObject[] = [];

    const STAKED_FOO_NAME = 'Staked Foo';
    const STAKED_FOO_SYMBOL = 'sFOO';
    const sFOO = await deploy('StakedFoo', [STAKED_FOO_NAME, STAKED_FOO_SYMBOL, FOOAddress]);
    contracts.push(sFOO);

    // verification
    if (verifiableNetwork.includes(network)) {
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
                    console.log(error);
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
