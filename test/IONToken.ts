import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const { parseEther, keccak256, toUtf8Bytes } = ethers.utils;
const { Zero, HashZero, MaxUint256 } = ethers.constants;
const BigNumber = ethers.BigNumber;

describe("IONToken", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  const FEE_DENOMINATOR = 1e10; // 1e18 - 1e10 = 1e8
  const DEFAULT_ADMIN_ROLE = HashZero;

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

    await underlyingToken.deployed();

    // ION token
    const IONToken = await ethers.getContractFactory("IONToken");
    const ionToken = await IONToken.deploy(
      "ION Token",
      "ION",
      underlyingToken.address,
      INIT_DEPOSIT_FEE_PERCENT,
      INIT_WITHDRAW_FEE_PERCENT
    );

    await ionToken.deployed();

    const ZERO_FEE_ROLE = await ionToken.ZERO_FEE_ROLE();

    return {
      underlyingToken,
      ionToken,
      owner,
      zeroFeeAccount,
      otherAccount,
      ZERO_FEE_ROLE,
    };
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { ionToken, owner } = await loadFixture(deployFixture);
      expect(
        await ionToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)
      ).to.equal(true);
    });

    it("Should set the right underlying token", async function () {
      const { ionToken, underlyingToken } = await loadFixture(
        deployFixture
      );
      expect(await ionToken.underlying()).to.equal(
        underlyingToken.address
      );
    });

    it("Should set the right init fee", async function () {
      const { ionToken } = await loadFixture(deployFixture);
      expect(await ionToken.depositFeePercent()).to.equal(
        INIT_DEPOSIT_FEE_PERCENT
      );
      expect(await ionToken.withdrawFeePercent()).to.equal(
        INIT_WITHDRAW_FEE_PERCENT
      );
    });
  });

  describe("Fee setter", () => {
    it("Should set deposit fee", async function () {
      const { ionToken } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther((10).toString()).div(FEE_DENOMINATOR); // 10%
      await ionToken.setFee(feePercentToSet, true);
      expect(await ionToken.depositFeePercent()).to.equal(feePercentToSet);
    });
    it("Should set withdraw fee", async function () {
      const { ionToken } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther((10).toString()).div(FEE_DENOMINATOR); // 10%
      await ionToken.setFee(feePercentToSet, false);
      expect(await ionToken.withdrawFeePercent()).to.equal(
        feePercentToSet
      );
    });
    it("Should reverted if set deposit fee reach max fee percent", async function () {
      const { ionToken } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther(
        MAX_FEE_PERCENT.add(
          parseEther((1).toString()).div(FEE_DENOMINATOR)
        ).toString()
      ).div(FEE_DENOMINATOR); // Max + 1 %
      await expect(
        ionToken.setFee(feePercentToSet, true)
      ).to.be.revertedWith("Max fee reach");
    });
    it("Should reverted if set withdraw fee reach max fee percent", async function () {
      const { ionToken } = await loadFixture(deployFixture);
      const feePercentToSet = parseEther(
        MAX_FEE_PERCENT.add(
          parseEther((1).toString()).div(FEE_DENOMINATOR)
        ).toString()
      ).div(FEE_DENOMINATOR); // Max + 1 %
      await expect(
        ionToken.setFee(feePercentToSet, false)
      ).to.be.revertedWith("Max fee reach");
    });
  });

  describe("Wrapping", () => {
    const wrappingTest = async (feePercent: number) => {
      const { ionToken, underlyingToken, otherAccount } =
        await loadFixture(deployFixture);
      // Set deposit fee
      const feePercentToSet = parseEther(feePercent.toString()).div(
        FEE_DENOMINATOR
      );
      await ionToken.setFee(feePercentToSet, true);
      expect(await ionToken.depositFeePercent()).to.equal(feePercentToSet);
      // Mint underlying token to other account
      await underlyingToken.mint(otherAccount.address, parseEther("100"));
      expect(await underlyingToken.balanceOf(otherAccount.address)).to.eq(
        parseEther("100")
      );
      // User approve underlying for deposit to wrapper contract
      await underlyingToken
        .connect(otherAccount)
        .approve(ionToken.address, MaxUint256);
      expect(
        await underlyingToken.allowance(
          otherAccount.address,
          ionToken.address
        )
      ).to.eq(MaxUint256);
      // Wrapping
      const numberToWarpping = parseEther("50");

      const { fee, amountAfterFee } = await ionToken
        .connect(otherAccount)
        .calculateFee(otherAccount.address, numberToWarpping, true);
      await ionToken
        .connect(otherAccount)
        .depositFor(otherAccount.address, numberToWarpping);

      expect(await underlyingToken.balanceOf(otherAccount.address)).to.eq(
        numberToWarpping
      );

      expect(await ionToken.balanceOf(otherAccount.address)).to.eq(
        amountAfterFee
      );

      expect(fee).to.eq(numberToWarpping.sub(amountAfterFee));

      // console.log(
      //   `fee ${feePercent}% of ${ethers.utils.formatEther(
      //     numberToWarpping
      //   )}, fee: ${ethers.utils.formatEther(
      //     fee
      //   )}, after fee: ${ethers.utils.formatEther(amountAfterFee)}`
      // );
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

  describe("Unwrapping", () => {
    const unwrappingTest = async (feePercent: number) => {
      const { ionToken, underlyingToken, otherAccount } =
        await loadFixture(deployFixture);
      // Set deposit fee to zero
      await ionToken.setFee(0, true);
      // Set withdraw fee
      const feePercentToSet = parseEther(feePercent.toString()).div(
        FEE_DENOMINATOR
      );
      await ionToken.setFee(feePercentToSet, false);
      expect(await ionToken.withdrawFeePercent()).to.equal(
        feePercentToSet
      );
      // Mint underlying token to other account
      await underlyingToken.mint(otherAccount.address, parseEther("50"));
      expect(await underlyingToken.balanceOf(otherAccount.address)).to.eq(
        parseEther("50")
      );
      // User approve underlying for deposit to wrapper contract
      await underlyingToken
        .connect(otherAccount)
        .approve(ionToken.address, MaxUint256);
      // Wrapping
      const numberToWarpping = parseEther("50");
      await ionToken
        .connect(otherAccount)
        .depositFor(otherAccount.address, numberToWarpping);

      // Unwarpping
      const numberToUnwarpping = parseEther("50");

      const { fee, amountAfterFee } = await ionToken
        .connect(otherAccount)
        .calculateFee(otherAccount.address, numberToUnwarpping, false);

      expect(await ionToken.balanceOf(otherAccount.address)).to.eq(
        numberToUnwarpping
      );
      await ionToken
        .connect(otherAccount)
        .withdrawTo(otherAccount.address, numberToUnwarpping);

      expect(await underlyingToken.balanceOf(otherAccount.address)).to.eq(
        amountAfterFee
      );
      expect(fee).to.eq(numberToUnwarpping.sub(amountAfterFee));

      // console.log(
      //   `fee ${feePercent}% of ${ethers.utils.formatEther(
      //     numberToUnwarpping
      //   )}, fee: ${ethers.utils.formatEther(
      //     fee
      //   )}, after fee: ${ethers.utils.formatEther(amountAfterFee)}`
      // );
    };
    it("Should unwrap wrapper token without fee", () => unwrappingTest(0));
    it("Should unwrap wrapper token with 0.0001% fee", () =>
      unwrappingTest(0.0001));
    it("Should unwrap wrapper token with 0.001% fee", () =>
      unwrappingTest(0.001));
    it("Should unwrap wrapper token with 0.01% fee", () =>
      unwrappingTest(0.01));
    it("Should unwrap wrapper token with 0.1% fee", () => unwrappingTest(0.1));
    it("Should unwrap wrapper token with 1% fee", () => unwrappingTest(1));
    it("Should unwrap wrapper token with 10% fee", () => unwrappingTest(10));
    it("Should unwrap wrapper token with 20% fee", () => unwrappingTest(20));
    it("Should unwrap wrapper token with 30% fee", () => unwrappingTest(30));
    it("Should unwrap wrapper token with 40% fee", () => unwrappingTest(40));
    it("Should unwrap wrapper token with 50% fee", () => unwrappingTest(50));
    it("Should unwrap wrapper token with 60% fee", () => unwrappingTest(60));
    it("Should unwrap wrapper token with 70% fee", () => unwrappingTest(70));
    it("Should unwrap wrapper token with 80% fee", () => unwrappingTest(80));
    it("Should unwrap wrapper token with 90% fee", () => unwrappingTest(90));
  });

  describe("Zero fee warp & unwarp", () => {
    it("Should grant ZERO_FEE role", async () => {
      const { ionToken, zeroFeeAccount, ZERO_FEE_ROLE } = await loadFixture(
        deployFixture
      );
      expect(
        await ionToken.hasRole(ZERO_FEE_ROLE, zeroFeeAccount.address)
      ).to.eq(false);
      await ionToken.grantRole(ZERO_FEE_ROLE, zeroFeeAccount.address);
      expect(
        await ionToken.hasRole(ZERO_FEE_ROLE, zeroFeeAccount.address)
      ).to.eq(true);
    });
    it("Should warp with zero fee account", async () => {
      const { ionToken, underlyingToken, zeroFeeAccount, ZERO_FEE_ROLE } =
        await loadFixture(deployFixture);
      // Set deposit fee
      const feePercent = 10; // 10%
      const feePercentToSet = parseEther(feePercent.toString()).div(
        FEE_DENOMINATOR
      );
      await ionToken.setFee(feePercentToSet, true);
      expect(
        (
          await ionToken
            .connect(zeroFeeAccount)
            .calculateFee(zeroFeeAccount.address, parseEther("100"), true)
        ).amountAfterFee
      ).to.eq(parseEther("90"));
      // Grant ZERO_FEE role to zero fee account
      await ionToken.grantRole(ZERO_FEE_ROLE, zeroFeeAccount.address);
      expect(
        (
          await ionToken
            .connect(zeroFeeAccount)
            .calculateFee(zeroFeeAccount.address, parseEther("100"), true)
        ).amountAfterFee
      ).to.eq(parseEther("100"));
      // Mint underlying to zero fee account
      await underlyingToken.mint(zeroFeeAccount.address, parseEther("100"));
      // Zero fee account approve underlying to warpper
      await underlyingToken
        .connect(zeroFeeAccount)
        .approve(ionToken.address, MaxUint256);
      // Zero fee account warpping underlying token
      await ionToken
        .connect(zeroFeeAccount)
        .depositFor(zeroFeeAccount.address, parseEther("100"));
      expect(await ionToken.balanceOf(zeroFeeAccount.address)).to.eq(
        parseEther("100")
      );
      expect(await underlyingToken.balanceOf(zeroFeeAccount.address)).to.eq(
        Zero
      );
    });
    it("Should unwarp with zero fee account", async () => {
      const { ionToken, underlyingToken, zeroFeeAccount, ZERO_FEE_ROLE } =
        await loadFixture(deployFixture);

      const feePercent = 10; // 10%
      const feePercentToSet = parseEther(feePercent.toString()).div(
        FEE_DENOMINATOR
      );
      // Set deposit fee
      await ionToken.setFee(0, true);
      // Set withdraw fee
      await ionToken.setFee(feePercentToSet, false);
      expect(
        (
          await ionToken
            .connect(zeroFeeAccount)
            .calculateFee(zeroFeeAccount.address, parseEther("100"), false)
        ).amountAfterFee
      ).to.eq(parseEther("90"));
      // Grant ZERO_FEE role to zero fee account
      await ionToken.grantRole(ZERO_FEE_ROLE, zeroFeeAccount.address);
      expect(
        (
          await ionToken
            .connect(zeroFeeAccount)
            .calculateFee(zeroFeeAccount.address, parseEther("100"), false)
        ).amountAfterFee
      ).to.eq(parseEther("100"));
      // Mint underlying to zero fee account
      await underlyingToken.mint(zeroFeeAccount.address, parseEther("100"));
      // Zero fee account approve underlying to warpper
      await underlyingToken
        .connect(zeroFeeAccount)
        .approve(ionToken.address, MaxUint256);
      // Zero fee account warpping underlying token
      await ionToken
        .connect(zeroFeeAccount)
        .depositFor(zeroFeeAccount.address, parseEther("100"));
      // Zero fee account unwarpping warpper token
      await ionToken
        .connect(zeroFeeAccount)
        .withdrawTo(zeroFeeAccount.address, parseEther("100"));
      expect(await underlyingToken.balanceOf(zeroFeeAccount.address)).to.eq(
        parseEther("100")
      );
      expect(await ionToken.balanceOf(zeroFeeAccount.address)).to.eq(Zero);
    });
  });

  describe("Fee withdrawal by admin", () => {
    it("Should admin withdraw fee", async () => {
      const { ionToken, underlyingToken, owner, otherAccount } =
        await loadFixture(deployFixture);
      // Set deposit fee
      const feePercent = 10; // 10%
      const feePercentToSet = parseEther(feePercent.toString()).div(
        FEE_DENOMINATOR
      );
      await ionToken.setFee(feePercentToSet, true);
      // Mint underlying to other account
      await underlyingToken.mint(otherAccount.address, parseEther("100"));
      // Other account approve underlying to warpper
      await underlyingToken
        .connect(otherAccount)
        .approve(ionToken.address, MaxUint256);

      const { fee } = await ionToken
        .connect(otherAccount)
        .calculateFee(otherAccount.address, parseEther("100"), true);
      // Other account warpping underlying token
      await ionToken
        .connect(otherAccount)
        .depositFor(otherAccount.address, parseEther("100"));

      expect(await ionToken.feeBalance()).to.eq(fee);
      // Withdraw fee by admin
      await ionToken.withdrawFee(owner.address);
      expect(await underlyingToken.balanceOf(owner.address)).to.eq(fee);
    });
  });
});
