import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../../src/HardhatAccount";
import { BOACoin } from "../../src/utils/Amount";
import { KIOSERC20 } from "../../typechain-types";

import { BaseContract, Wallet } from "ethers";

import fs from "fs";

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

    public ownerAddress: string;

    constructor() {
        this.deployments = new Map<string, IDeployedContract>();
        this.deployers = [];

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
        const [deployer, feeAccount] = raws;

        this.accounts = {
            deployer,
            feeAccount,
        };

        this.ownerAddress = process.env.OWNER_ADDRESS || "";
    }

    public addContract(name: string, address: string, contract: BaseContract) {
        this.deployments.set(name, {
            name,
            address,
            contract,
        });
    }

    public getContract(name: string): BaseContract | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.contract;
        } else {
            return undefined;
        }
    }

    public getContractAddress(name: string): string | undefined {
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

    static filename = "./deploy/outer_chain_devnet/deployed_contracts.json";

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

async function deployToken(accounts: IAccount, deployment: Deployments) {
    const contractName = "KIOS";
    console.log(`Deploy ${contractName}...`);

    const factory = await ethers.getContractFactory("KIOSERC20");
    const contract = (await factory.connect(accounts.deployer).deploy(deployment.ownerAddress)) as KIOSERC20;
    await contract.deployed();
    await contract.deployTransaction.wait();

    const balance = await contract.balanceOf(deployment.ownerAddress);
    console.log(`KIOS token's owner: ${deployment.ownerAddress}`);
    console.log(`KIOS token's balance of owner: ${new BOACoin(balance).toDisplayString(true, 2)}`);

    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function main() {
    const deployments = new Deployments();

    deployments.addDeployer(deployToken);

    await deployments.loadContractInfo();

    await deployments.doDeploy();

    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
