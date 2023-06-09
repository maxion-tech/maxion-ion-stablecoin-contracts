import { ethers } from "hardhat";
const { parseEther } = ethers.utils;

async function main() {
  if (!process.env.UNDERLYING_TOKEN_ADDRESS || !process.env.ADMIN_ADDRESS)
    throw new Error("Please make sure all environment variable is loaded");

  const FEE_DENOMINATOR = 1e10; // 1e18 - 1e10 = 1e8

  const INIT_DEPOSIT_FEE_PERCENT = 0; // 0%
  const INIT_WITHDRAW_FEE_PERCENT = parseEther((1).toString()).div(
    FEE_DENOMINATOR
  ); // 1%

  const IONToken = await ethers.getContractFactory("IONToken");
  const ionToken = await IONToken.deploy(
    "ION Token",
    "ION",
    process.env.UNDERLYING_TOKEN_ADDRESS,
    INIT_DEPOSIT_FEE_PERCENT,
    INIT_WITHDRAW_FEE_PERCENT,
    process.env.ADMIN_ADDRESS,
  );

  console.log(`ION token deployed to ${ionToken.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
