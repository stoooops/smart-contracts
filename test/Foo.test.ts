import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import { expect } from "chai";

const {
    BN,           // Big Number support
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
  } = require('@openzeppelin/test-helpers');

const FOO_CAP = ethers.constants.WeiPerEther.mul(BigNumber.from(100000000))

describe("Foo token", () => {
    let accounts: Signer[];

    let owner: Signer;
    let user: Signer;

    let ownerAddress: string;
    let userAddress: string;

    let token: Contract;

    const tokenName = "Foo";
    const tokenSymbol = "FOO";

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        owner = accounts[1];
        user = accounts[2];

        ownerAddress = await owner.getAddress();
        userAddress = await user.getAddress();
    });


    describe("Foo token", () => {
        beforeEach(async () => {
            const Token = await ethers.getContractFactory("Foo");
            token = await Token.connect(owner).deploy(tokenName, tokenSymbol, FOO_CAP);
            await token.deployed();
        });

        // ERC20 SNAPSHOT TESTING
        describe("ERC20 functions", async () => {

            it("token name is correct", async() => {
                expect(await token.name()).to.equal(tokenName);
            });

            it("token symbol is correct", async() => {
                expect(await token.symbol()).to.equal(tokenSymbol);
            });

            it("token cap is correct", async() => {
                expect(await token.cap()).to.equal(FOO_CAP);
            });

            it("token decimals is correct", async() => {
                expect(await token.decimals()).to.equal(18);
            });

            it("owner is owner", async () => {
                expect(await token.owner()).to.equal(ownerAddress);
            });

            it("only owner can mint", async() => {
                await token.connect(owner).mint(ownerAddress, FOO_CAP);
                expect(await token.balanceOf(ownerAddress)).to.equal(FOO_CAP);
            });

            it("mint emits transfer event", async() => {
                await expect(token.connect(owner).mint(ownerAddress, FOO_CAP))
                    .to.emit(token, "Transfer")
                    .withArgs(constants.ZERO_ADDRESS, ownerAddress, FOO_CAP);
            });

            it("non-owner cannot mint", async() => {
                await expect(token.connect(user).mint(userAddress, FOO_CAP))
                    .to.be.revertedWith("Ownable: caller is not the owner");
                expect(await token.connect(user).balanceOf(userAddress))
                    .to.equal(0);
            });

            it("burn works", async() => {
                //mint the cap
                await token.connect(owner).mint(ownerAddress, FOO_CAP);
                //make sure the total supply equals the mint
                expect(await token.totalSupply()).to.equal(FOO_CAP);
                //make sure the owner got all the tokens
                expect(await token.balanceOf(ownerAddress)).to.equal(FOO_CAP)
                //burn the whole she-bang
                expect(await token.connect(owner).burn(FOO_CAP))
                    .to.emit(token, "Transfer")
                    .withArgs(ownerAddress, constants.ZERO_ADDRESS, FOO_CAP);
                //make sure the resulting balance is zero
                expect(await token.balanceOf(ownerAddress)).to.equal(0)
                expect(await token.totalSupply()).to.equal(0);
            });

        });
    });
});