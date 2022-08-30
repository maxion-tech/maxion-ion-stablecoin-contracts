import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const { parseEther, keccak256, toUtf8Bytes } = ethers.utils;
const { Zero, HashZero, MaxUint256 } = ethers.constants;
const BigNumber = ethers.BigNumber;

describe("IONStablecoin", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  const FEE_DENOMINATOR = 1e10; // 1e18 - 1e10 = 1e8
  const DEFAULT_ADMIN_ROLE = HashZero;
  const PAUSER_ROLE = keccak256(toUtf8Bytes("PAUSER_ROLE"));
  const ZERO_FEE_ROLE = keccak256(toUtf8Bytes("ZERO_FEE_ROLE"));

  const MAX_FEE_PERCENT = parseEther((90).toString()).div(FEE_DENOMINATOR); // 90%
  const INIT_DEPOSIT_FEE_PERCENT = 0; // 0%
  const INIT_WITHDRAW_FEE_PERCENT = parseEther((1).toString()).div(
    FEE_DENOMINATOR
  ); // 1%

  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, zeroFeeAccount, otherAccount] = await ethers.getSigners();

    // Underlying token
    const UnderlyingToken = await ethers.getContractFactory("ERC20Mock");
    const underlyingToken = await UnderlyingToken.deploy("USD Coin", "USDC");

    // ION stablecoin
    const IONStablecoin = await ethers.getContractFactory("IONStablecoin");
    const ionStablecoin = await IONStablecoin.deploy(
      "ION Stablecoin",
      "ION",
      underlyingToken.address,
      INIT_DEPOSIT_FEE_PERCENT,
      INIT_WITHDRAW_FEE_PERCENT
    );

    return {
      underlyingToken,
      ionStablecoin,
      owner,
      zeroFeeAccount,
      otherAccount,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { ionStablecoin, owner } = await loadFixture(deployFixture);
      expect(
        await ionStablecoin.hasRole(DEFAULT_ADMIN_ROLE, owner.address)
      ).to.equal(true);
    });

    it("Should set the right underlying token", async function () {
      const { ionStablecoin, underlyingToken } = await loadFixture(
        deployFixture
      );
      expect(await ionStablecoin.underlying()).to.equal(
        underlyingToken.address
      );
    });

    it("Should set the right init fee", async function () {
      const { ionStablecoin } = await loadFixture(deployFixture);
      expect(await ionStablecoin._depositFeePercent()).to.equal(
        INIT_DEPOSIT_FEE_PERCENT
      );
      expect(await ionStablecoin._withdrawFeePercent()).to.equal(
        INIT_WITHDRAW_FEE_PERCENT
      );
    });
  });

  describe("Fee setter", function () {
    it("Should set deposit fee", async function () {
      const { ionStablecoin } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther((10).toString()).div(FEE_DENOMINATOR); // 10%
      await ionStablecoin.setFee(feePercentToSet, true);
      expect(await ionStablecoin._depositFeePercent()).to.equal(
        feePercentToSet
      );
    });
    it("Should set withdraw fee", async function () {
      const { ionStablecoin } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther((10).toString()).div(FEE_DENOMINATOR); // 10%
      await ionStablecoin.setFee(feePercentToSet, false);
      expect(await ionStablecoin._withdrawFeePercent()).to.equal(
        feePercentToSet
      );
    });
    it("Should reverted if set deposit fee reach max fee percent", async function () {
      const { ionStablecoin } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther(
        MAX_FEE_PERCENT.add(
          parseEther((1).toString()).div(FEE_DENOMINATOR)
        ).toString()
      ).div(FEE_DENOMINATOR); // Max + 1 %
      await expect(
        ionStablecoin.setFee(feePercentToSet, true)
      ).to.be.revertedWith("Max fee reach");
    });
    it("Should reverted if set withdraw fee reach max fee percent", async function () {
      const { ionStablecoin } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther(
        MAX_FEE_PERCENT.add(
          parseEther((1).toString()).div(FEE_DENOMINATOR)
        ).toString()
      ).div(FEE_DENOMINATOR); // Max + 1 %
      await expect(
        ionStablecoin.setFee(feePercentToSet, false)
      ).to.be.revertedWith("Max fee reach");
    });
  });

  describe("Wrapping", function () {
    const wrappingTest = async (feePercent: number) => {
      const { ionStablecoin, underlyingToken, otherAccount } =
        await loadFixture(deployFixture);
      // Set deposit fee
      const feePercentToSet = parseEther(feePercent.toString()).div(
        FEE_DENOMINATOR
      );
      await ionStablecoin.setFee(feePercentToSet, true);
      expect(await ionStablecoin._depositFeePercent()).to.equal(
        feePercentToSet
      );
      // Mint underlying token to other account
      await underlyingToken.mint(otherAccount.address, parseEther("100"));
      expect(await underlyingToken.balanceOf(otherAccount.address)).to.eq(
        parseEther("100")
      );
      // User approve underlying for deposit to wrapper contract
      await underlyingToken
        .connect(otherAccount)
        .approve(ionStablecoin.address, MaxUint256);
      expect(
        await underlyingToken.allowance(
          otherAccount.address,
          ionStablecoin.address
        )
      ).to.eq(MaxUint256);
      // Wrapping
      const numberToWarpping = parseEther("50");

      const { fee, amountAfterFee } = await ionStablecoin
        .connect(otherAccount)
        .calculateFee(numberToWarpping, true);
      await ionStablecoin
        .connect(otherAccount)
        .depositFor(otherAccount.address, numberToWarpping);

      expect(await underlyingToken.balanceOf(otherAccount.address)).to.eq(
        numberToWarpping
      );

      expect(await ionStablecoin.balanceOf(otherAccount.address)).to.eq(
        amountAfterFee
      );

      expect(fee).to.eq(numberToWarpping.sub(amountAfterFee));
    };
    it("Should wrap underlying token without fee", () => wrappingTest(0));
    it("Should wrap underlying token with 0.0001% fee", () =>
      wrappingTest(0.0001));
    it("Should wrap underlying token with 0.001% fee", () =>
      wrappingTest(0.001));
    it("Should wrap underlying token with 0.01% fee", () => wrappingTest(0.01));
    it("Should wrap underlying token with 0.1% fee", () => wrappingTest(0.1));
    it("Should wrap underlying token with 1% fee", () => wrappingTest(1));
    it("Should wrap underlying token with 10% fee", () => wrappingTest(10));
    it("Should wrap underlying token with 20% fee", () => wrappingTest(20));
    it("Should wrap underlying token with 30% fee", () => wrappingTest(30));
    it("Should wrap underlying token with 40% fee", () => wrappingTest(40));
    it("Should wrap underlying token with 50% fee", () => wrappingTest(50));
    it("Should wrap underlying token with 60% fee", () => wrappingTest(60));
    it("Should wrap underlying token with 70% fee", () => wrappingTest(70));
    it("Should wrap underlying token with 80% fee", () => wrappingTest(80));
    it("Should wrap underlying token with 90% fee", () => wrappingTest(90));
  });
});
