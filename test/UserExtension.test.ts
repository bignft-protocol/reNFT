import { ethers } from 'ethers';
import assert from 'assert';
import { assertRevert, ZERO_ADDRESS, ZERO_BYTE } from './utils/assert';
import {
  ERC1400,
  ERC1400TokensRecipientMock,
  ERC1400TokensRecipientMock__factory,
  ERC1400TokensSenderMock,
  ERC1400TokensSenderMock__factory,
  ERC1400__factory,
  ERC1820Registry,
  ERC1820Registry__factory
} from '../typechain-types';
import truffleFixture from './truffle-fixture';
import { getSigners } from 'hardhat';
import { partitions } from './utils/bytes';

const ERC1400_TOKENS_SENDER = 'ERC1400TokensSender';
const ERC1400_TOKENS_RECIPIENT = 'ERC1400TokensRecipient';

const CERTIFICATE_SIGNER = '0xe31C41f0f70C5ff39f73B4B94bcCD767b3071630';
const VALID_CERTIFICATE =
  '0x1000000000000000000000000000000000000000000000000000000000000000';

const INVALID_CERTIFICATE_SENDER =
  '0x1100000000000000000000000000000000000000000000000000000000000000';
const INVALID_CERTIFICATE_RECIPIENT =
  '0x2200000000000000000000000000000000000000000000000000000000000000';

const issuanceAmount = 1000;

describe('ERC1400 with sender and recipient hooks', function () {
  const [
    signer,
    operatorSigner,
    controllerSigner,
    tokenHolderSigner,
    recipientSigner,
    unknownSigner
  ] = getSigners(6);

  let registry: ERC1820Registry;

  before(async function () {
    await truffleFixture([2]);

    registry = ERC1820Registry__factory.deployed;
  });

  // HOOKS

  describe('hooks', function () {
    let token: ERC1400;
    let senderContract: ERC1400TokensSenderMock;
    let recipientContract: ERC1400TokensRecipientMock;

    beforeEach(async function () {
      token = await new ERC1400__factory(signer).deploy(
        'ERC1400Token',
        'DAU',
        1,
        [controllerSigner.getAddress()],
        partitions
      );

      senderContract = await new ERC1400TokensSenderMock__factory(
        tokenHolderSigner
      ).deploy();

      await registry
        .connect(tokenHolderSigner)
        .setInterfaceImplementer(
          tokenHolderSigner.getAddress(),
          ethers.utils.id(ERC1400_TOKENS_SENDER),
          senderContract.address
        );

      recipientContract = await new ERC1400TokensRecipientMock__factory(
        recipientSigner
      ).deploy();
      await registry
        .connect(recipientSigner)
        .setInterfaceImplementer(
          recipientSigner.getAddress(),
          ethers.utils.id(ERC1400_TOKENS_RECIPIENT),
          recipientContract.address
        );

      await token
        .connect(signer)
        .issue(
          tokenHolderSigner.getAddress(),
          issuanceAmount,
          VALID_CERTIFICATE
        );
    });
    afterEach(async function () {
      await registry
        .connect(tokenHolderSigner)
        .setInterfaceImplementer(
          tokenHolderSigner.getAddress(),
          ethers.utils.id(ERC1400_TOKENS_SENDER),
          ZERO_ADDRESS
        );
      await registry
        .connect(recipientSigner)
        .setInterfaceImplementer(
          recipientSigner.getAddress(),
          ethers.utils.id(ERC1400_TOKENS_RECIPIENT),
          ZERO_ADDRESS
        );
    });
    describe('when the transfer is successfull', function () {
      it('transfers the requested amount', async function () {
        await token
          .connect(tokenHolderSigner)
          .transferWithData(
            recipientSigner.getAddress(),
            issuanceAmount,
            VALID_CERTIFICATE
          );
        const senderBalance = await token.balanceOf(
          tokenHolderSigner.getAddress()
        );
        assert.strictEqual(senderBalance.toNumber(), 0);

        const recipientBalance = await token.balanceOf(
          recipientSigner.getAddress()
        );
        assert.strictEqual(recipientBalance.toNumber(), issuanceAmount);
      });
    });
    describe('when the transfer fails', function () {
      it('sender hook reverts', async function () {
        // Default sender hook failure data for the mock only: 0x1100000000000000000000000000000000000000000000000000000000000000
        await assertRevert(
          token
            .connect(tokenHolderSigner)
            .transferWithData(
              recipientSigner.getAddress(),
              issuanceAmount,
              INVALID_CERTIFICATE_SENDER
            )
        );
      });
      it('recipient hook reverts', async function () {
        // Default recipient hook failure data for the mock only: 0x2200000000000000000000000000000000000000000000000000000000000000
        await assertRevert(
          token
            .connect(tokenHolderSigner)
            .transferWithData(
              recipientSigner.getAddress(),
              issuanceAmount,
              INVALID_CERTIFICATE_RECIPIENT
            )
        );
      });
    });
  });
});
