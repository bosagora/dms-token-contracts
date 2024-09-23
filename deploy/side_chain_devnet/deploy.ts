import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../../src/HardhatAccount";
import { BOACoin } from "../../src/utils/Amount";
import { ContractUtils } from "../../src/utils/ContractUtils";
import { ACC, MultiSigWallet, MultiSigWalletFactory } from "../../typechain-types";

import { BaseContract, Contract, Wallet } from "ethers";

import fs from "fs";

const network = "bosagora_devnet";

export const MULTI_SIG_WALLET_FACTORY_ADDRESS: { [key: string]: string } = {
    bosagora_mainnet: "0xF120890C71B2B9fF4578088A398a2402Ae0d3616",
    bosagora_testnet: "0xF120890C71B2B9fF4578088A398a2402Ae0d3616",
    bosagora_devnet: "0xF120890C71B2B9fF4578088A398a2402Ae0d3616",
};

interface IDeployedContract {
    name: string;
    address: string;
    contract: BaseContract;
}

interface IAccount {
    deployer: Wallet;
    owner: Wallet;
    feeAccount: Wallet;
    tokenOwners: Wallet[];
}

type FnDeployer = (accounts: IAccount, deployment: Deployments) => void;

class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public deployers: FnDeployer[];
    public accounts: IAccount;
    private MULTI_SIG_WALLET_FACTORY_CONTRACT: Contract | undefined;

    public requiredMultiSigWallet: number = 2;

    constructor() {
        this.deployments = new Map<string, IDeployedContract>();
        this.deployers = [];

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
        const [deployer, owner, feeAccount, tokenOwner1, tokenOwner2, tokenOwner3] = raws;

        this.accounts = {
            deployer,
            owner,
            feeAccount,
            tokenOwners: [tokenOwner1, tokenOwner2, tokenOwner3],
        };
    }

    public async attachPreviousContracts() {
        const factory = await ethers.getContractFactory("MultiSigWalletFactory");
        this.MULTI_SIG_WALLET_FACTORY_CONTRACT = factory.attach(
            MULTI_SIG_WALLET_FACTORY_ADDRESS[network]
        ) as BaseContract;
    }

    public addContract(name: string, address: string, contract: BaseContract) {
        this.deployments.set(name, {
            name,
            address,
            contract,
        });
    }

    public getContract(name: string): BaseContract | undefined {
        if (name === "MultiSigWalletFactory") {
            return this.MULTI_SIG_WALLET_FACTORY_CONTRACT;
        }
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.contract;
        } else {
            return undefined;
        }
    }

    public getContractAddress(name: string): string | undefined {
        if (name === "MultiSigWalletFactory") {
            return MULTI_SIG_WALLET_FACTORY_ADDRESS[network];
        }
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.address;
        } else {
            return undefined;
        }
    }

    public addDeployer(deployer: FnDeployer) {
        this.deployers.push(deployer);
    }

    public async doDeploy() {
        for (const elem of this.deployers) {
            try {
                await elem(this.accounts, this);
            } catch (error) {
                console.log(error);
            }
        }
    }

    static filename = "./deploy/side_chain_devnet/deployed_contracts.json";

    public async loadContractInfo() {
        if (!fs.existsSync(Deployments.filename)) return;

        const data: any = JSON.parse(fs.readFileSync(Deployments.filename, "utf-8"));

        for (const key of Object.keys(data)) {
            const name = key;
            const address = data[key];
            console.log(`Load ${name} - ${address}...`);
            this.deployments.set(key, {
                name,
                address,
                contract: (await ethers.getContractFactory(name)).attach(address),
            });
        }
    }

    public saveContractInfo() {
        const contents: any = {};
        for (const key of this.deployments.keys()) {
            const item = this.deployments.get(key);
            if (item !== undefined) {
                contents[key] = item.address;
            }
        }
        fs.writeFileSync(Deployments.filename, JSON.stringify(contents), "utf-8");
    }
}

async function deployMultiSigWalletFactory(accounts: IAccount, deployment: Deployments) {
    const contractName = "MultiSigWalletFactory";
    console.log(`Deploy ${contractName}...`);
    const factory = await ethers.getContractFactory("MultiSigWalletFactory");
    const contract = (await factory.connect(accounts.deployer).deploy()) as MultiSigWalletFactory;
    await contract.deployed();
    await contract.deployTransaction.wait();

    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployMultiSigWallet(accounts: IAccount, deployment: Deployments): Promise<MultiSigWallet | undefined> {
    const contractName = "MultiSigWallet";
    console.log(`Deploy ${contractName}...`);
    if (deployment.getContract("MultiSigWalletFactory") === undefined) {
        console.error("Contract is not deployed!");
        return;
    }

    const factoryContract = deployment.getContract("MultiSigWalletFactory") as MultiSigWalletFactory;

    const address = await ContractUtils.getEventValueString(
        await factoryContract.connect(accounts.deployer).create(
            "OwnerWallet",
            "",
            deployment.accounts.tokenOwners.map((m) => m.address),
            deployment.requiredMultiSigWallet,
            1
        ),
        factoryContract.interface,
        "ContractInstantiation",
        "wallet"
    );

    if (address !== undefined) {
        const contract = (await ethers.getContractFactory("MultiSigWallet")).attach(address) as MultiSigWallet;

        const owners = await contract.getMembers();
        for (let idx = 0; idx < owners.length; idx++) {
            console.log(`MultiSigWallet's owners[${idx}]: ${owners[idx]}`);
        }

        deployment.addContract(contractName, contract.address, contract);
        console.log(`Deployed ${contractName} to ${contract.address}`);
    } else {
        console.error(`Failed to deploy ${contractName}`);
    }
}

async function deployToken(accounts: IAccount, deployment: Deployments) {
    const contractName = "ACC";
    console.log(`Deploy ${contractName}...`);
    if (deployment.getContract("MultiSigWallet") === undefined) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("ACC");
    const contract = (await factory
        .connect(accounts.deployer)
        .deploy(deployment.getContractAddress("MultiSigWallet"), deployment.accounts.feeAccount.address)) as ACC;
    await contract.deployed();
    await contract.deployTransaction.wait();

    const owner = await contract.getOwner();
    const balance = await contract.balanceOf(owner);
    console.log(`ACC token's owner: ${owner}`);
    console.log(`ACC token's balance of owner: ${new BOACoin(balance).toDisplayString(true, 2)}`);

    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function mintInitialSupplyToken(accounts: IAccount, deployment: Deployments) {
    const contractName = "LoyaltyToken";

    const contract = deployment.getContract("ACC") as ACC;

    const amount = BOACoin.make(10_000_000_000);

    const encodedData = contract.interface.encodeFunctionData("mint", [amount.value]);
    const wallet = deployment.getContract("MultiSigWallet") as MultiSigWallet;
    const transactionId = await ContractUtils.getEventValueBigNumber(
        await wallet
            .connect(accounts.tokenOwners[0])
            .submitTransaction("Mint", `Mint ${amount.toDisplayString()}`, contract.address, 0, encodedData),
        wallet.interface,
        "Submission",
        "transactionId"
    );

    if (transactionId === undefined) {
        console.error(`Failed to submit transaction for token mint`);
    } else {
        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await wallet.connect(accounts.tokenOwners[1]).confirmTransaction(transactionId),
            wallet.interface,
            "Execution",
            "transactionId"
        );

        if (executedTransactionId === undefined || !transactionId.eq(executedTransactionId)) {
            console.error(`Failed to confirm transaction for token mint`);
        }
    }

    console.log(`Mint ${contractName} to ${wallet.address}`);
}

async function distributeToken(accounts: IAccount, deployment: Deployments) {
    const contractName = "LoyaltyToken";

    const contract = deployment.getContract("ACC") as ACC;

    const amount = BOACoin.make(5_000_000_000);

    const encodedData = contract.interface.encodeFunctionData("transfer", [accounts.owner.address, amount.value]);
    const wallet = deployment.getContract("MultiSigWallet") as MultiSigWallet;
    const transactionId = await ContractUtils.getEventValueBigNumber(
        await wallet
            .connect(accounts.tokenOwners[0])
            .submitTransaction(
                "Transfer",
                `Transfer ${amount.toDisplayString()} to ${accounts.owner.address}`,
                contract.address,
                0,
                encodedData
            ),
        wallet.interface,
        "Submission",
        "transactionId"
    );

    if (transactionId === undefined) {
        console.error(`Failed to submit transaction for token transfer`);
    } else {
        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await wallet.connect(accounts.tokenOwners[1]).confirmTransaction(transactionId),
            wallet.interface,
            "Execution",
            "transactionId"
        );

        if (executedTransactionId === undefined || !transactionId.eq(executedTransactionId)) {
            console.error(`Failed to confirm transaction for token transfer`);
        }
    }

    console.log(`Distribute ${contractName}`);
}

async function main() {
    const deployments = new Deployments();

    await deployments.attachPreviousContracts();

    // deployments.addDeployer(deployMultiSigWalletFactory);
    deployments.addDeployer(deployMultiSigWallet);
    deployments.addDeployer(deployToken);
    deployments.addDeployer(mintInitialSupplyToken);
    deployments.addDeployer(distributeToken);

    await deployments.loadContractInfo();

    await deployments.doDeploy();

    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
