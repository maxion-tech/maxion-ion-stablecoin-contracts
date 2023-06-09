// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract IONToken is ERC20Wrapper, Pausable, AccessControl {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ZERO_FEE_ROLE = keccak256("ZERO_FEE_ROLE");

    uint256 private constant FEE_DENOMINATOR = 10000000000; // 10**10
    uint256 private constant MAX_FEE = 9000000000; // 90 * 10**8 Max fee 90%

    uint256 public depositFeePercent;
    uint256 public withdrawFeePercent;
    uint256 public feeBalance = 0;

    event DepositFor(
        address indexed account,
        uint256 amount,
        uint256 amountAfterFee,
        uint256 fee
    );
    event WithdrawTo(
        address indexed account,
        uint256 amount,
        uint256 amountAfterFee,
        uint256 fee
    );

    event SetDepositFee(uint256 oldFeePercent, uint256 newFeePercent);
    event SetWithdrawFee(uint256 oldFeePercent, uint256 newFeePercent);

    event WithdrawFee(address indexed account, uint256 amount);

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        IERC20 underlyingToken,
        uint256 initDepositFeePercent,
        uint256 initWithdrawFeePercent,
        address admin
    ) ERC20(tokenName, tokenSymbol) ERC20Wrapper(underlyingToken) {
        require(
            address(underlyingToken) != address(0),
            "Underlying token must not be zero address"
        );
        require(
            address(admin) != address(0) && address(admin) != msg.sender,
            "Admin address must not be zero or msg.sender"
        );
        require(
            initDepositFeePercent <= MAX_FEE,
            "Deposit fee must be greater than zero and less than max fee"
        );

        require(
            initWithdrawFeePercent <= MAX_FEE,
            "Withdraw fee must be greater than zero and less than max fee"
        );

        depositFeePercent = initDepositFeePercent;
        withdrawFeePercent = initWithdrawFeePercent;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev Fee calculation. Set deposit to true if want to calculate deposit side overwise mean withdraw.
     */
    function calculateFee(
        address account,
        uint256 amount,
        bool deposit
    ) public view returns (uint256 fee, uint256 amountAfterFee) {
        if (hasRole(ZERO_FEE_ROLE, account)) {
            fee = 0;
            amountAfterFee = amount;
        } else {
            fee =
                (amount * (deposit ? depositFeePercent : withdrawFeePercent)) /
                FEE_DENOMINATOR;
            amountAfterFee = amount - fee;
        }
    }

    /**
     * @dev Allow a user to deposit underlying tokens and mint the corresponding number of wrapped tokens.
     */
    function depositFor(address account, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        uint256 balanceBefore = underlying.balanceOf(address(this));
        SafeERC20.safeTransferFrom(
            underlying,
            _msgSender(),
            address(this),
            amount
        );
        uint256 balanceAfter = underlying.balanceOf(address(this));
        uint256 amountToMint = balanceAfter - balanceBefore;
        (uint256 fee, uint256 amountAfterFee) = this.calculateFee(
            _msgSender(),
            amountToMint,
            true
        );
        emit DepositFor(account, amount, amountAfterFee, fee);
        _mint(account, amountAfterFee);

        feeBalance = feeBalance + fee;

        return true;
    }

    /**
     * @dev Allow a user to burn a number of wrapped tokens and withdraw the corresponding number of underlying tokens.
     */
    function withdrawTo(address account, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        (uint256 fee, uint256 amountAfterFee) = calculateFee(
            _msgSender(),
            amount,
            false
        );
        _burn(_msgSender(), amount);
        feeBalance = feeBalance + fee;
        emit WithdrawTo(account, amount, amountAfterFee, fee);
        SafeERC20.safeTransfer(underlying, account, amountAfterFee);
        return true;
    }

    /**
     * @dev Fee withdrawal. For admin only
     */
    function withdrawFee(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "To address must not be zero address");
        require(feeBalance > 0, "No more fee to withdraw");
        uint256 balanceToWithdraw = feeBalance;
        feeBalance = 0;
        emit WithdrawFee(to, balanceToWithdraw);
        SafeERC20.safeTransfer(underlying, to, balanceToWithdraw);
    }

    /**
     * @dev Set deposit/withdraw fee. For admin only
     */
    function setFee(uint256 newPercent, bool deposit)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newPercent <= MAX_FEE, "Max fee reach");
        uint256 oldFeePercent = deposit
            ? depositFeePercent
            : withdrawFeePercent;
        if (deposit) {
            depositFeePercent = newPercent;
            emit SetDepositFee(oldFeePercent, newPercent);
        } else {
            withdrawFeePercent = newPercent;
            emit SetWithdrawFee(oldFeePercent, newPercent);
        }
    }
}
