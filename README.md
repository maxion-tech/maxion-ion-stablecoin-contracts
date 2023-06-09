# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a script that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
GAS_REPORT=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.ts
```

Verify command example
### Testnet
```shell
npx hardhat verify --network bscTestnet 0x1B3eb089cB7aAEE3c119091ce291590F464Eb6a5 "ION Token" "ION" $UNDERLYING_TOKEN_ADDRESS 0 100000000 $ADMIN_ADDRESS
```
### Mainnet
```shell
npx hardhat verify --network bsc 0x033c1C03718ba0F0871bB4DCC38b24F065D585bc "ION Token" "ION" 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d 0 100000000 $ADMIN_ADDRESS