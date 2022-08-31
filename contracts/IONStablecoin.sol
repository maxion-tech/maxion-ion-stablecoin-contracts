// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract IONStablecoin is ERC20Wrapper, Pausable, AccessControl {
    using SafeMath for uint256;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ZERO_FEE_ROLE = keccak256("ZERO_FEE_ROLE");

    uint256 private constant FEE_DENOMINATOR = 10**10;
    uint256 private constant MAX_FEE = 90 * 10**8; // Max fee 90%

    uint256 public depositFeePercent;
    uint256 public withdrawFeePercent;
    uint256 public feeBalance = 0;

    event DepositFor(
        address account,
        uint256 amount,
        uint256 amountAfterFee,
        uint256 fee
    );
    event WithdrawTo(
        address account,
        uint256 amount,
        uint256 amountAfterFee,
        uint256 fee
    );

    event SetDepositFee(uint256 oldFeePercent, uint256 newFeePercent);
    event SetWithdrawFee(uint256 oldFeePercent, uint256 newFeePercent);

    event WithdrawFee(address account, uint256 amount);

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        IERC20 underlyingToken,
        uint256 initDepositFeePercent,
        uint256 initWithdrawFeePercent
    ) ERC20(tokenName, tokenSymbol) ERC20Wrapper(underlyingToken) {
        require(
            address(underlyingToken) != address(0),
            "Underlying token must not be zero address"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(ZERO_FEE_ROLE, msg.sender);

        depositFeePercent = initDepositFeePercent;
        withdrawFeePercent = initWithdrawFeePercent;
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
    ) external view returns (uint256 fee, uint256 amountAfterFee) {
        if (hasRole(ZERO_FEE_ROLE, account)) {
            fee = 0;
            amountAfterFee = amount;
        } else {
            fee = amount
                .mul(deposit ? depositFeePercent : withdrawFeePercent)
                .div(FEE_DENOMINATOR);
            amountAfterFee = amount.sub(fee);
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
        (uint256 fee, uint256 amountAfterFee) = this.calculateFee(
            _msgSender(),
            amount,
            true
        );

        _mint(account, amountAfterFee);
        feeBalance = feeBalance.add(fee);

        emit DepositFor(account, amount, amountAfterFee, fee);
        SafeERC20.safeTransferFrom(
            underlying,
            _msgSender(),
            address(this),
            amount
        );
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
        (uint256 fee, uint256 amountAfterFee) = this.calculateFee(
            _msgSender(),
            amount,
            false
        );
        _burn(_msgSender(), amount);
        feeBalance = feeBalance.add(fee);
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
     * @dev Set desosit/withdraw fee. For admin only
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
