import { ethers } from "hardhat";
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import hre from "hardhat";

const { parseEther } = ethers.utils;

async function main() {
    if (!process.env.UNDERLYING_TOKEN_ADDRESS)
        throw new Error("Please make sure all environment variable is loaded");

    const networkUrl = (hre.network.config as any).url;

    if(!networkUrl) throw new Error("Please make sure all environment variable is loaded");

    const provider = new ethers.providers.JsonRpcProvider(networkUrl);
    const type = 'hid';
    const path = `m/44'/60'/0'/0/0`;
    const signer = new LedgerSigner(provider, type, path);

    const address = await signer.getAddress();

    console.log(`Deploying from ${address}`);

    const FEE_DENOMINATOR = 1e10; // 1e18 - 1e10 = 1e8

    const INIT_DEPOSIT_FEE_PERCENT = 0; // 0%
    const INIT_WITHDRAW_FEE_PERCENT = parseEther((1).toString()).div(
        FEE_DENOMINATOR
    ); // 1%

    const IONToken = await ethers.getContractFactory("IONToken");
    const ionToken = await IONToken.connect(signer).deploy(
        "ION Token",
        "ION",
        process.env.UNDERLYING_TOKEN_ADDRESS,
        INIT_DEPOSIT_FEE_PERCENT,
        INIT_WITHDRAW_FEE_PERCENT
    );

    console.log(`ION token deployed to ${ionToken.address} on ${hre.network.name}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
