import { ethers, waffle } from 'hardhat';
import { BigNumber, Contract, Signer } from 'ethers';
import { expect } from 'chai';
const Web3Utils = require('web3-utils');
const {
    BN, // Big Number support
    constants, // Common constants, like the zero address and largest integers
    expectEvent, // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const Foo_CAP = ethers.constants.WeiPerEther.mul(BigNumber.from(100000000));

// needs to be future date so that tests can run well into future
// 2030-04-20 00:00 UTC
// const STAKING_START_TIME = 1902873600;
const STAKING_PERIOD_EPOCHS = 30;

// at one point the conversion was off by 1 and I let it go but now it's back to zero
const ALMOST_ZERO = 1;

function addSeconds(t: number, n: number): number {
    return t + n;
}

function addMinutes(t: number, n: number): number {
    return t + n * 60;
}

function addHours(t: number, n: number): number {
    return t + n * 60 * 60;
}

function addDays(t: number, n: number): number {
    return t + n * 24 * 60 * 60;
}

interface User {
    signer: Signer;
    address: string;
}

describe('StakedFoo', () => {
    const provider = waffle.provider;

    let admin: User;
    let userAlice: User;
    let userBob: User;
    let userCat: User;
    let users: User[];

    let token: Contract;
    let stakedToken: Contract;

    beforeEach(async function () {
        const accounts: Signer[] = await ethers.getSigners();

        async function getUser(i: number): Promise<User> {
            return {
                signer: accounts[i],
                address: await accounts[i].getAddress(),
            };
        }
        admin = await getUser(1);
        userAlice = await getUser(2);
        userBob = await getUser(3);
        userCat = await getUser(4);

        users = [userAlice, userBob, userCat];
    });

    describe('StakedFoo contract', () => {
        beforeEach(async () => {
            // deploy FOO token
            let Token = await ethers.getContractFactory('Foo');
            token = await Token.connect(admin.signer).deploy('Foo Token', 'FOO', Foo_CAP);
            await token.deployed();

            // deploy sFOO
            let StakedToken = await ethers.getContractFactory('StakedFoo');
            stakedToken = await StakedToken.connect(admin.signer).deploy(
                'Staked Foo Token',
                'sFOO',
                token.address
            );
            await stakedToken.deployed();
        });

        async function fundFOO(address: string, numFOO: string | number) {
            const amount: BigNumber = ethers.utils.parseUnits(numFOO.toString(), 9);
            await token.mint(address, amount);
            return amount;
        }

        function decimals9(amount: string | number): BigNumber {
            return ethers.utils.parseUnits(amount.toString(), 9);
        }

        describe('stake tests', () => {
            beforeEach(async () => {
                await fundFOO(admin.address, 100000);
                await token.connect(admin.signer).approve(stakedToken.address, decimals9(10000000000));

                for (const user of users) {
                    await fundFOO(user.address, 10000);
                    await token.connect(user.signer).approve(stakedToken.address, decimals9(10000000000));
                }
            });

            it('Cannot remove stake if never added stake', async () => {
                await expect(stakedToken.connect(userAlice.signer).removeStake(1)).to.be.revertedWith(
                    'Cannot remove stake for more tokens than owned'
                );
            });

            it('FOO/sFOO ratio should start at 1', async () => {
                const amount = 10;
                expect(await stakedToken.toStakedToken(amount)).to.be.equal(amount);
                expect(await stakedToken.toBaseToken(amount)).to.be.equal(amount);
            });

            it('Can setup staking', async () => {
                const epochLength = 3600;
                expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                await stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS, epochLength, decimals9(6.9));
                expect(await stakedToken.secondsUntilNextVest()).to.be.eq(epochLength);
                expect(await stakedToken.isVestingRewardsNow()).to.be.true;
            });

            it('Cannot setup staking for 0 seconds', async () => {
                await expect(
                    stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS, 0, decimals9(6.9))
                ).to.be.revertedWith('Sanity check: minimum epoch length is 1 second');
            });

            it('Cannot setup staking for >86400 seconds', async () => {
                await expect(
                    stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS, 60 * 60 * 24 + 1, decimals9(6.9))
                ).to.be.revertedWith('Sanity check: can only set epoch length up to 1 day');
            });

            it('Cannot setup staking for >180 days total', async () => {
                const oneDaySec = 60 * 60 * 24;
                const daysLimit = 180;
                await expect(
                    stakedToken.fundStakingRewards(daysLimit + 1, oneDaySec, decimals9(6.9))
                ).to.be.revertedWith('Sanity check: can only setup 180 days of rewards at a time');
                await expect(
                    stakedToken.fundStakingRewards(24 * daysLimit + 1, oneDaySec / 24, decimals9(6.9))
                ).to.be.revertedWith('Sanity check: can only setup 180 days of rewards at a time');
                await expect(
                    stakedToken.fundStakingRewards(24 * daysLimit, oneDaySec / 24 + 1, decimals9(6.9))
                ).to.be.revertedWith('Sanity check: can only setup 180 days of rewards at a time');
                await expect(
                    stakedToken.fundStakingRewards(60 * 24 * daysLimit + 1, oneDaySec / 60 / 24, decimals9(6.9))
                ).to.be.revertedWith('Sanity check: can only setup 180 days of rewards at a time');
                await expect(
                    stakedToken.fundStakingRewards(60 * 24 * daysLimit, oneDaySec / 60 / 24 + 1, decimals9(6.9))
                ).to.be.revertedWith('Sanity check: can only setup 180 days of rewards at a time');
            });

            it('Can setup staking after deposit', async () => {
                expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                await testAddStake9(1, userAlice);
                expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                await stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS, 3600, decimals9(6.9));
                expect(await stakedToken.isVestingRewardsNow()).to.be.true;
            });

            it('Can setup staking after deposit + withdrawal', async () => {
                expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                await testAddRemoveStake(1, userAlice);
                expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                await stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS, 3600, decimals9(6.9));
                expect(await stakedToken.isVestingRewardsNow()).to.be.true;
            });

            async function testAddStake9(amount: number, user: User) {
                const amountConverted = decimals9(amount);
                await testAddStake(amountConverted, user);
            }

            async function testAddStake(amount: BigNumber, user: User) {
                // initial balances
                const beforeFOO = await token.balanceOf(user.address);
                const beforeStakedFOO = await stakedToken.balanceOf(user.address);
                const beforeStakedFOOSupply = await stakedToken.totalSupply();

                // stake FOO
                const expectedReceivedStakedFOO = await stakedToken.toStakedToken(amount);
                await stakedToken.connect(user.signer).addStake(amount);

                // after balances
                const afterFOO = await token.balanceOf(user.address);
                const afterStakedFOO = await stakedToken.balanceOf(user.address);
                const afterStakedFOOSupply = await stakedToken.totalSupply();
                // should deduct correct amount of FOO
                expect(beforeFOO - afterFOO).to.be.equal(amount);
                // should reward correct amount of sFOO
                expect(afterStakedFOO - beforeStakedFOO).to.be.equal(expectedReceivedStakedFOO);
                // sFOO supply should be minted
                expect(afterStakedFOOSupply - beforeStakedFOOSupply).to.be.equal(expectedReceivedStakedFOO);

                // ensure internal accounting ratios unchanged. Another deposit should yield same FOO/sFOO ratio
                const recalculateExpectedReceivedStakedFOO = await stakedToken.toStakedToken(amount);
                expect(recalculateExpectedReceivedStakedFOO - expectedReceivedStakedFOO).to.be.lessThanOrEqual(
                    ALMOST_ZERO
                );
            }

            async function testRemoveStake9(amount: number, user: User) {
                const amountConverted = decimals9(amount);
                await testRemoveStake(amountConverted, user);
            }

            async function testRemoveStake(sAmount: BigNumber, user: User) {
                // initial balances
                const beforeFOO = await token.balanceOf(user.address);
                const beforeStakedFOO = await stakedToken.balanceOf(user.address);
                const beforeStakedFOOSupply = await stakedToken.totalSupply();

                // remove staked FOO
                const expectedReceivedFOO = await stakedToken.toBaseToken(sAmount);
                await stakedToken.connect(user.signer).removeStake(sAmount);

                // after balances
                const afterFOO = await token.balanceOf(user.address);
                const afterStakedFOO = await stakedToken.balanceOf(user.address);
                const afterStakedFOOSupply = await stakedToken.totalSupply();
                // should give back correct amount of FOO
                expect(afterFOO - beforeFOO).to.be.equal(expectedReceivedFOO);
                // should deduct correct amount of sFOO
                expect(beforeStakedFOO - afterStakedFOO).to.be.equal(sAmount);
                // sFOO supply should be burned
                expect(beforeStakedFOOSupply - afterStakedFOOSupply).to.be.equal(sAmount);

                // ensure internal accounting ratios unchanged
                if (sAmount.lte(await stakedToken.totalSupply())) {
                    const recalculateExpectedReceivedFOO = await stakedToken.toBaseToken(sAmount);
                    expect(recalculateExpectedReceivedFOO - expectedReceivedFOO).to.be.lessThanOrEqual(ALMOST_ZERO);
                }
            }

            async function testAddRemoveStake(amount: number, user: User) {
                expect(await stakedToken.balanceOf(user.address)).to.be.equal(0);
                await testAddStake9(amount, user);
                expect((await stakedToken.balanceOf(user.address)).toNumber()).to.be.greaterThan(0);
                await testRemoveStake9(amount, user);
                expect(await stakedToken.balanceOf(user.address)).to.be.equal(0);
            }

            describe('post-setup tests', () => {
                beforeEach(async () => {
                    expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                    await stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS, 3600, decimals9(6.9));
                    expect(await stakedToken.isVestingRewardsNow()).to.be.true;
                });

                it('Can add stake', async () => {
                    await testAddStake9(1, userAlice);
                });

                it('Multiple users can add stake', async () => {
                    for (const user of users) {
                        await testAddStake9(1, user);
                    }
                });

                it('Can add stake multiple times in a row', async () => {
                    await testAddStake9(1, userAlice);
                    await testAddStake9(10, userAlice);
                    await testAddStake9(100, userAlice);
                    await testAddStake9(1000, userAlice);
                });

                it('Multiple users add stake multiple times in a row', async () => {
                    for (const user of users) {
                        await testAddStake9(1, user);
                        await testAddStake9(10, user);
                        await testAddStake9(100, user);
                        await testAddStake9(1000, user);
                    }
                });

                it('Multiple users add stake multiple times in a row interleaved', async () => {
                    for (const user of users) {
                        await testAddStake9(1, user);
                    }
                    for (const user of users) {
                        await testAddStake9(10, user);
                    }
                    for (const user of users) {
                        await testAddStake9(100, user);
                    }
                    for (const user of users) {
                        await testAddStake9(1000, user);
                    }
                });

                it('Can add/remove stake', async () => {
                    await testAddRemoveStake(1, userAlice);
                });

                it('Multiple users can add/remove stake', async () => {
                    for (const user of users) {
                        await testAddRemoveStake(1, user);
                    }
                });

                it('Can add/remove stake multiple times in a row', async () => {
                    const user: User = userAlice;
                    await testAddRemoveStake(1, user);
                    await testAddRemoveStake(10, user);
                    await testAddRemoveStake(100, user);
                    await testAddRemoveStake(1000, user);
                    await testAddRemoveStake(10000, user);
                });

                it('Multiple users can add/remove stake multiple times in a row', async () => {
                    for (const user of users) {
                        await testAddRemoveStake(1, user);
                        await testAddRemoveStake(10, user);
                        await testAddRemoveStake(100, user);
                        await testAddRemoveStake(1000, user);
                        await testAddRemoveStake(10000, user);
                    }
                });

                it('Multiple users can add/remove stake multiple times in a row interleaved', async () => {
                    for (const user of users) {
                        await testAddRemoveStake(1, user);
                    }
                    for (const user of users) {
                        await testAddRemoveStake(10, user);
                    }
                    for (const user of users) {
                        await testAddRemoveStake(100, user);
                    }
                    for (const user of users) {
                        await testAddRemoveStake(1000, user);
                    }
                    for (const user of users) {
                        await testAddRemoveStake(10000, user);
                    }
                });

                async function evmGoToRewardsEpoch(n: number) {
                    const rewardsPeriodStartTime: number = (await stakedToken.getRewardsPeriodStartTime()).toNumber();
                    const epochLength: number = (await stakedToken.getRewardsEpochLength()).toNumber();
                    const elapsedEpochsLengthSeconds = epochLength * n;
                    const newTime: number = rewardsPeriodStartTime + elapsedEpochsLengthSeconds;
                    await provider.send('evm_mine', [newTime]);
                }

                describe('vest once tests', () => {
                    it('Can remove stake after vest once', async () => {
                        const user: User = userAlice;
                        await testAddStake9(1, user);
                        await evmGoToRewardsEpoch(1);
                        await testRemoveStake(await stakedToken.balanceOf(user.address), user);
                    });

                    it('Multiple users can remove stake after vest once', async () => {
                        for (const user of users) {
                            await testAddStake9(1, user);
                        }
                        await evmGoToRewardsEpoch(1);
                        for (const user of users) {
                            await testRemoveStake(await stakedToken.balanceOf(user.address), user);
                        }
                    });

                    it('If stake after vest once, get fewer staking tokens second time.', async () => {
                        const user: User = userAlice;
                        // setup initial stakes
                        await testAddStake9(1, user);
                        const originalStakedTokenBalance: BigNumber = await stakedToken.balanceOf(user.address);

                        // ADVANCE EPOCHS TO VEST REWARDS
                        await evmGoToRewardsEpoch(1);

                        // add stake again
                        await testAddStake9(1, user);
                        // remove original stake
                        await testRemoveStake(originalStakedTokenBalance, user);
                        // remaining bal = amount from staking on epoch 2 => should be < epoch 1 staked tokens
                        const afterVestStakedTokenBalance = await stakedToken.balanceOf(user.address);
                        expect(afterVestStakedTokenBalance.lt(originalStakedTokenBalance));
                    });

                    it('If one staker and withdraw after vest once, pool is empty again.', async () => {
                        const user: User = userAlice;
                        // setup initial stakes
                        await testAddStake9(1, user);
                        const originalStakedTokenBalance: BigNumber = await stakedToken.balanceOf(user.address);

                        // ADVANCE DAYS TO VEST REWARDS
                        await evmGoToRewardsEpoch(1);

                        // remove original stake
                        await testRemoveStake(originalStakedTokenBalance, user);
                        // pool should be empty now
                        expect(await stakedToken.getStakingPoolSize()).to.be.eq(0);

                        // add stake again
                        await testAddStake9(1, user);
                        // should get back same amount as we got the first time since pool has been drained
                        const balance: BigNumber = await stakedToken.balanceOf(user.address);
                        expect(originalStakedTokenBalance.sub(balance)).to.be.eq(0);
                    });

                    it('If multiple stakers all withdraw after vest once, pool is empty again.', async () => {
                        // setup initial stakes
                        for (const user of users) {
                            await testAddStake9(1, user);
                        }

                        // ADVANCE DAYS TO VEST REWARDS
                        await evmGoToRewardsEpoch(1);

                        // remove original stakes
                        for (const user of users) {
                            await testRemoveStake(await stakedToken.balanceOf(user.address), user);
                        }
                        // pool should be empty now
                        expect(await stakedToken.getStakingPoolSize()).to.be.eq(0);
                    });
                });

                describe('vest multiple times tests', () => {
                    it('Can remove stake after vest multiple times', async () => {
                        const user: User = userAlice;
                        const preBalance: BigNumber = await token.balanceOf(user.address);
                        const rewards: BigNumber[] = [BigNumber.from(0)];
                        await testAddStake(preBalance, user);
                        // vest once
                        await evmGoToRewardsEpoch(1);
                        rewards.push(await stakedToken.toBaseToken(await stakedToken.balanceOf(user.address)));
                        expect(preBalance.lt(rewards[1])).to.be.true;
                        // vest again
                        await evmGoToRewardsEpoch(2);
                        rewards.push(await stakedToken.toBaseToken(await stakedToken.balanceOf(user.address)));
                        expect(rewards[1].lt(rewards[2])).to.be.true;
                        // remove stake
                        await testRemoveStake(await stakedToken.balanceOf(user.address), user);
                        const postBalance: BigNumber = await token.balanceOf(user.address);
                        expect(preBalance.lt(postBalance)).to.be.true;
                    });

                    it('Rewards fully vest after funded epochs pass', async () => {
                        for (const user of users) {
                            await testAddStake(await token.balanceOf(user.address), user);
                        }
                        // fully vest
                        const epochs: number = (await stakedToken.getRewardsFundedEpochs()).toNumber();
                        await evmGoToRewardsEpoch(epochs);
                        expect(await stakedToken.vestedRewards()).to.be.eq(await stakedToken.totalRewards());
                    });

                    it('No more rewards after vest period completes', async () => {
                        for (const user of users) {
                            await testAddStake(await token.balanceOf(user.address), user);
                        }
                        const epochs: number = (await stakedToken.getRewardsFundedEpochs()).toNumber();
                        await evmGoToRewardsEpoch(epochs);
                        let rewards: BigNumber = await stakedToken.vestedRewards();
                        expect(rewards).to.be.eq(await stakedToken.totalRewards());
                        // same rewards after more time passes
                        await evmGoToRewardsEpoch(epochs + 10);
                        rewards = await stakedToken.vestedRewards();
                        expect(rewards).to.be.eq(await stakedToken.totalRewards());
                    });
                });

                describe('post-vest full', () => {
                    beforeEach(async () => {
                        // deposit
                        for (const user of users) {
                            await testAddStake(await token.balanceOf(user.address), user);
                        }
                        // fully vest
                        const epochs: number = (await stakedToken.getRewardsFundedEpochs()).toNumber();
                        await evmGoToRewardsEpoch(epochs);
                    });

                    it('Can withdraw all tokens', async () => {
                        for (const user of users) {
                            await testRemoveStake(await stakedToken.balanceOf(user.address), user);
                        }
                        expect(await stakedToken.getStakingPoolSize()).to.be.eq(0);
                    });

                    it('Can setup another staking period', async () => {
                        const epochLength = 69;
                        const rewardsPerEpoch = decimals9(420);
                        // before: vested rewards > 0
                        expect((await stakedToken.vestedRewards()).gt(0)).to.be.true;
                        const beforePoolSize = await stakedToken.getStakingPoolSize();
                        await stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS, epochLength, rewardsPerEpoch);
                        expect(await stakedToken.secondsUntilNextVest()).to.be.eq(epochLength);
                        expect(await stakedToken.getRewardsEpochLength()).to.be.eq(epochLength);
                        // after: vested rewards == 0, same pool size
                        const afterPoolSize = await stakedToken.getStakingPoolSize();
                        const afterDeposits = await stakedToken.getPoolDeposits();
                        expect(await stakedToken.getRewardsPeriodPoolWithdrawalsTotal()).to.be.eq(0);
                        expect(await stakedToken.vestedRewards()).to.be.eq(0);
                        expect(beforePoolSize).to.be.eq(afterDeposits);
                        expect(beforePoolSize).to.be.eq(afterPoolSize);
                        expect(afterPoolSize).to.be.eq(afterDeposits);
                        expect(await stakedToken.getRewardsEpochLength()).to.be.eq(epochLength);
                        expect(await stakedToken.getRewardsPerEpoch()).to.be.eq(rewardsPerEpoch);
                    });

                    describe('post-setup second staking period', () => {
                        beforeEach(async () => {
                            await stakedToken.fundStakingRewards(STAKING_PERIOD_EPOCHS * 2, 3600, decimals9(420));
                        });

                        it('Rewards fully vest after funded epochs pass', async () => {
                            for (const user of users) {
                                await testAddStake(await token.balanceOf(user.address), user);
                            }
                            // fully vest
                            const epochs: number = (await stakedToken.getRewardsFundedEpochs()).toNumber();
                            await evmGoToRewardsEpoch(epochs);
                            expect(await stakedToken.vestedRewards()).to.be.eq(await stakedToken.totalRewards());
                        });

                        it('No more rewards after vest period completes', async () => {
                            for (const user of users) {
                                await testAddStake(await token.balanceOf(user.address), user);
                            }
                            const epochs: number = (await stakedToken.getRewardsFundedEpochs()).toNumber();
                            await evmGoToRewardsEpoch(epochs);
                            let rewards: BigNumber = await stakedToken.vestedRewards();
                            expect(rewards).to.be.eq(await stakedToken.totalRewards());
                            // same rewards after more time passes
                            await evmGoToRewardsEpoch(epochs + 10);
                            rewards = await stakedToken.vestedRewards();
                            expect(rewards).to.be.eq(await stakedToken.totalRewards());
                        });
                    });
                });

                describe('FOO/sFOO ratio invariant tests', () => {
                    it('if no one stakes, the FOO/sFOO ratios stays at 1 even as rewards vest', async () => {
                        const FOOAmount = decimals9(1);
                        const sFOOAmount = await stakedToken.toStakedToken(FOOAmount);
                        let prevVestedRewards = 0;

                        // ratio should remain 1:1 across all the epochs
                        for (let i = 1; i <= STAKING_PERIOD_EPOCHS; i++) {
                            expect(await stakedToken.isVestingRewardsNow()).to.be.true;
                            await evmGoToRewardsEpoch(i);
                            expect(await stakedToken.isVestingRewardsNow()).to.be.eq(i < STAKING_PERIOD_EPOCHS);
                            expect((await stakedToken.toStakedToken(FOOAmount)).toNumber()).to.be.equal(
                                sFOOAmount.toNumber()
                            );

                            const vestedRewards = (await stakedToken.vestedRewards()).toNumber();
                            expect(vestedRewards).to.be.greaterThan(0);
                            expect(vestedRewards).to.be.greaterThan(prevVestedRewards);
                            prevVestedRewards = vestedRewards;
                        }
                        const vestedRewards = (await stakedToken.vestedRewards()).toNumber();
                        // after the last epoch now it is equal
                        for (let i = STAKING_PERIOD_EPOCHS + 1; i <= STAKING_PERIOD_EPOCHS + 10; i++) {
                            expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                            await evmGoToRewardsEpoch(i);
                            expect(await stakedToken.isVestingRewardsNow()).to.be.false;
                            expect((await stakedToken.toStakedToken(FOOAmount)).toNumber()).to.be.equal(
                                sFOOAmount.toNumber()
                            );

                            // vest rewards total stays the same after staking concludes
                            expect((await stakedToken.vestedRewards()).toNumber()).to.be.equal(vestedRewards);
                        }
                    });

                    it('if at least one staker, FOO/sFOO ratio monotonically reduces every epoch of vesting until end then unchanged', async () => {
                        // need something in staking pool or else always returns 1
                        const user: User = userAlice;
                        await testAddStake9(1, user);

                        const FOOAmount = decimals9(1);
                        const sFOOAmount = await stakedToken.toStakedToken(FOOAmount);
                        let prevSFOOAmount = sFOOAmount;

                        // invariant: every epoch that stakes the ratio should decrease
                        for (let i = 1; i <= STAKING_PERIOD_EPOCHS; i++) {
                            await evmGoToRewardsEpoch(i);
                            expect((await stakedToken.getElapsedEpochs()).toNumber()).to.be.eq(i);
                            expect((await stakedToken.getRemainingEpochs()).toNumber()).to.be.eq(
                                STAKING_PERIOD_EPOCHS - i
                            );
                            const newSFOOAmount = await stakedToken.toStakedToken(FOOAmount);
                            expect(newSFOOAmount.toNumber()).to.be.lessThan(prevSFOOAmount.toNumber());
                            prevSFOOAmount = newSFOOAmount;

                            expect((await stakedToken.vestedRewards()).toNumber()).to.be.greaterThan(0);
                        }
                        const lastDaySFOOAmount = prevSFOOAmount;
                        const vestedRewards = (await stakedToken.vestedRewards()).toNumber();

                        // invariant: after the last epoch now it is the same on subsequent epochs
                        for (let i = STAKING_PERIOD_EPOCHS + 1; i <= STAKING_PERIOD_EPOCHS + 10; i++) {
                            await evmGoToRewardsEpoch(i);
                            expect((await stakedToken.getElapsedEpochs()).toNumber()).to.be.eq(STAKING_PERIOD_EPOCHS);
                            expect((await stakedToken.getRemainingEpochs()).toNumber()).to.be.eq(0);
                            const newSFOOAmount = await stakedToken.toStakedToken(FOOAmount);
                            expect(newSFOOAmount.toNumber()).to.be.equal(lastDaySFOOAmount.toNumber());

                            // total vested rewards stays the same after staking concludes
                            expect((await stakedToken.vestedRewards()).toNumber()).to.be.equal(vestedRewards);
                        }
                    });
                });
            });
        });
    });
});
