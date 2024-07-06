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
    feeAccount: Wallet;
}

type FnDeployer = (accounts: IAccount, deployment: Deployments) => void;

class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public deployers: FnDeployer[];
    public accounts: IAccount;
    private MULTI_SIG_WALLET_FACTORY_CONTRACT: Contract | undefined;

    public ownersOfMultiSigWallet: string[] = [
        "0x2312c098Cef41C0F55350bC3Ad8F4AFf983d9432",
        "0x5AD84fF1bD71cDEa7C3083706F2D1232a453C604",
        "0x9630fF452211Cc95BBFa32c0C4cF68eB498b8549",
    ];
    public requiredMultiSigWallet: number = 2;

    constructor() {
        this.deployments = new Map<string, IDeployedContract>();
        this.deployers = [];

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
        const [deployer, feeAccount] = raws;

        this.accounts = {
            deployer,
            feeAccount,
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

    static filename = "./deploy/main_chain_devnet/deployed_contracts.json";

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
        await factoryContract
            .connect(accounts.deployer)
            .create("OwnerWallet", "", deployment.ownersOfMultiSigWallet, deployment.requiredMultiSigWallet, 1),
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

async function main() {
    const deployments = new Deployments();

    await deployments.attachPreviousContracts();

    // deployments.addDeployer(deployMultiSigWalletFactory);
    deployments.addDeployer(deployMultiSigWallet);
    deployments.addDeployer(deployToken);

    await deployments.loadContractInfo();

    await deployments.doDeploy();

    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
