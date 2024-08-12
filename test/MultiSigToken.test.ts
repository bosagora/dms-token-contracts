import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { KIOS, MultiSigWallet, MultiSigWalletFactory } from "../typechain-types";

import assert from "assert";
import { BigNumber, Wallet } from "ethers";
import { ContractUtils } from "../src/utils/ContractUtils";

import { expect } from "chai";

async function deployMultiSigWalletFactory(deployer: Wallet): Promise<MultiSigWalletFactory> {
    const factory = await ethers.getContractFactory("MultiSigWalletFactory");
    const contract = (await factory.connect(deployer).deploy()) as MultiSigWalletFactory;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}

async function deployMultiSigWallet(
    factoryAddress: string,
    deployer: Wallet,
    owners: string[],
    required: number,
    seed: BigNumber
): Promise<MultiSigWallet | undefined> {
    const contractFactory = await ethers.getContractFactory("MultiSigWalletFactory");
    const factoryContract = contractFactory.attach(factoryAddress) as MultiSigWalletFactory;

    const address = await ContractUtils.getEventValueString(
        await factoryContract.connect(deployer).create("", "", owners, required, seed),
        factoryContract.interface,
        "ContractInstantiation",
        "wallet"
    );

    return address !== undefined
        ? ((await ethers.getContractFactory("MultiSigWallet")).attach(address) as MultiSigWallet)
        : undefined;
}

async function deployToken(deployer: Wallet, owner: string, feeAccount: string): Promise<KIOS> {
    const factory = await ethers.getContractFactory("KIOS");
    const contract = (await factory.connect(deployer).deploy(owner, feeAccount)) as KIOS;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}

describe("Test for KIOS token", () => {
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, feeAccount, account0, account1, account2, account3, account4] = raws;
    const owners1 = [account0, account1, account2];

    let multiSigFactory: MultiSigWalletFactory;
    let multiSigWallet: MultiSigWallet | undefined;
    let token: KIOS;
    const requiredConfirmations = 2;

    before(async () => {
        multiSigFactory = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory);
    });

    it("Create Wallet by Factory", async () => {
        multiSigWallet = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            owners1.map((m) => m.address),
            requiredConfirmations,
            BigNumber.from(1)
        );
        assert.ok(multiSigWallet);

        assert.deepStrictEqual(
            await multiSigWallet.getMembers(),
            owners1.map((m) => m.address)
        );

        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account0.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account1.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account2.address), BigNumber.from(1));
    });

    it("Create Token, Owner is wallet", async () => {
        const factory = await ethers.getContractFactory("KIOS");
        await expect(factory.connect(deployer).deploy(account0.address, feeAccount.address)).to.be.revertedWith(
            "function call to a non-contract account"
        );
    });

    it("Create Token, Owner is MultiSigWallet", async () => {
        assert.ok(multiSigWallet);

        token = await deployToken(deployer, multiSigWallet.address, feeAccount.address);
        assert.deepStrictEqual(await token.getOwner(), multiSigWallet.address);
        assert.deepStrictEqual(await token.balanceOf(multiSigWallet.address), BigNumber.from(0));
    });

    it("Fail mint initial supply", async () => {
        const amount = BigNumber.from(10).pow(BigNumber.from(18));
        await expect(token.connect(account0).mint(amount)).to.be.revertedWith("Only the owner can execute");
    });

    it("mint initial supply", async () => {
        assert.ok(multiSigWallet);
        assert.ok(token);

        const initialSupply = BigNumber.from(10).pow(BigNumber.from(28));

        const mintEncoded = token.interface.encodeFunctionData("mint", [initialSupply]);

        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(account0)
                .submitTransaction("Mint", "Mint 1 token", token.address, 0, mintEncoded),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account1).confirmTransaction(transactionId),
            multiSigWallet.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);

        // Check balance of target
        assert.deepStrictEqual(await token.balanceOf(multiSigWallet.address), initialSupply);
    });

    it("Fail transfer", async () => {
        const amount = BigNumber.from(10).pow(BigNumber.from(18));
        await expect(token.connect(account0).transfer(account4.address, amount)).to.be.revertedWith(
            "ERC20: transfer amount exceeds balance"
        );
    });

    it("Success transfer", async () => {
        assert.ok(multiSigWallet);
        assert.ok(token);

        const initialSupply = BigNumber.from(10)
            .pow(BigNumber.from(10))
            .mul(BigNumber.from(10).pow(BigNumber.from(18)));
        const amount = BigNumber.from(10).pow(BigNumber.from(18));

        assert.deepStrictEqual(await token.balanceOf(multiSigWallet.address), initialSupply);

        const mintEncoded = token.interface.encodeFunctionData("transfer", [account4.address, amount]);

        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(account0)
                .submitTransaction("Transfer", "Transfer 1 token", token.address, 0, mintEncoded),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account1).confirmTransaction(transactionId),
            multiSigWallet.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);

        // Check balance of target
        assert.deepStrictEqual(await token.balanceOf(account4.address), amount);

        // Check balance of wallet
        assert.deepStrictEqual(await token.balanceOf(multiSigWallet.address), initialSupply.sub(amount));
    });
});
