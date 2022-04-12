import { MintInfo } from '@solana/spl-token'
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import BN from 'bn.js'
import useRealm from '@hooks/useRealm'
import {
    getTokenOwnerRecordAddress,
    Proposal,
    withSetGovernanceDelegate,
} from '@solana/spl-governance'
import useWalletStore from '../../stores/useWalletStore'
import { sendTransaction } from '@utils/send'
import Button from '../Button'
import { Option } from '@tools/core/option'
import { GoverningTokenType } from '@solana/spl-governance'
import { fmtMintAmount } from '@tools/sdk/units'
import { getMintMetadata } from '../instructions/programs/splToken'
import { getProgramVersionForRealm } from '@models/registry/api'
import { useEffect, useState } from 'react'
import Input from 'components/inputs/Input'
import Tooltip from 'components/Tooltip'

const DelegationCard = ({ proposal }: { proposal?: Option<Proposal> }) => {
  const { councilMint, mint, realm } = useRealm()
//   const connected = useWalletStore((s) => s.connected)
  const wallet = useWalletStore((s) => s.current)
  const setTokenOwneRecordPk = useState('')
//   const { fmtUrlWithCluster } = useQueryContext()
  const isDelegationVisible = (
    depositMint: MintInfo | undefined,
    realmMint: PublicKey | undefined
  ) =>
    depositMint &&
    (!proposal ||
      (proposal.isSome() &&
        proposal.value.governingTokenMint.toBase58() === realmMint?.toBase58()))

  const communityDelegationVisible =
    // If there is no council then community deposit is the only option to show
    isDelegationVisible(mint, realm?.account.communityMint)

  useEffect(() => {
    const getTokenOwnerRecord = async () => {
      const defaultMint = !mint?.supply.isZero()
        ? realm!.account.communityMint
        : !councilMint?.supply.isZero()
        ? realm!.account.config.councilMint
        : undefined
      const tokenOwnerRecordAddress = await getTokenOwnerRecordAddress(
        realm!.owner,
        realm!.pubkey,
        defaultMint!,
        wallet!.publicKey!
      )
      setTokenOwneRecordPk(tokenOwnerRecordAddress.toBase58())
    }
    if (realm && wallet?.connected) {
      getTokenOwnerRecord()
    }
  }, [realm?.pubkey.toBase58(), wallet?.connected])
  const hasLoaded = mint || councilMint

  return (
    <div className="bg-bkg-2 p-4 md:p-6 rounded-lg">
      {hasLoaded ? (
        <div className="space-y-4">
          {communityDelegationVisible && (
            <Delegation
              mint={mint}
              tokenType={GoverningTokenType.Community}
              councilVote={false}
            />
          )}
        </div>
      ) : (
        <>
          <div className="animate-pulse bg-bkg-3 h-12 mb-4 rounded-lg" />
          <div className="animate-pulse bg-bkg-3 h-10 rounded-lg" />
        </>
      )}
    </div>
  )
}

const Delegation = ({
  mint,
  tokenType,
}: {
  mint: MintInfo | undefined
  tokenType: GoverningTokenType
  councilVote?: boolean
}) => {
  const wallet = useWalletStore((s) => s.current)
  const [comment, setComment] = useState('')
  const connected = useWalletStore((s) => s.connected)
  const connection = useWalletStore((s) => s.connection.current)
  const { fetchWalletTokenAccounts, fetchRealm } = useWalletStore(
    (s) => s.actions
  )
  const {
    realm,
    realmInfo,
    realmTokenAccount,
    ownTokenRecord,
    ownCouncilTokenRecord,
    councilTokenAccount,
  } = useRealm()
  // Do not show deposits for mints with zero supply because nobody can deposit anyway
  if (!mint || mint.supply.isZero()) {
    return null
  }

  const depositTokenRecord =
    tokenType === GoverningTokenType.Community
      ? ownTokenRecord
      : ownCouncilTokenRecord

  const depositTokenAccount =
    tokenType === GoverningTokenType.Community
      ? realmTokenAccount
      : councilTokenAccount

  const depositMint =
    tokenType === GoverningTokenType.Community
      ? realm?.account.communityMint
      : realm?.account.config.councilMint

  const tokenName = getMintMetadata(depositMint)?.name ?? realm?.account.name

  const depositTokenName = `${tokenName} ${
    tokenType === GoverningTokenType.Community ? '' : 'Admin'
  }`

  const delegateTokens = async function () {
    const instructions: TransactionInstruction[] = []
    const signers: Keypair[] = []

    const msg = new PublicKey(comment)

    await withSetGovernanceDelegate(
        instructions,
        realmInfo!.programId,
        getProgramVersionForRealm(realmInfo!),
        realm!.pubkey,
        depositTokenAccount!.account.mint,
        wallet!.publicKey!,
        wallet!.publicKey!,
        msg
    )

    const transaction = new Transaction()
    transaction.add(...instructions)

    await sendTransaction({
      connection,
      wallet,
      transaction,
      signers,
      sendingMessage: 'Delegating voting power',
      successMessage: 'Voting power has been delegated',
    })

    await fetchWalletTokenAccounts()
    await fetchRealm(realmInfo!.programId, realmInfo!.realmId)
  }

  const delegateAllTokens = async () =>
    await delegateTokens()

  const hasTokensInWallet =
    depositTokenAccount && depositTokenAccount.account.amount.gt(new BN(0))

  const hasTokensDeposited =
    depositTokenRecord &&
    depositTokenRecord.account.governingTokenDepositAmount.gt(new BN(0))

  const depositTooltipContent = !connected
    ? 'Connect your wallet to delegate'
    : !hasTokensInWallet
    ? "You don't have any governance tokens in your wallet to delegate."
    : ''

  const availableTokens =
    depositTokenRecord && mint
      ? fmtMintAmount(
          mint,
          depositTokenRecord.account.governingTokenDepositAmount
        )
      : '0'

  const canShowAvailableTokensMessage =
    !hasTokensDeposited && hasTokensInWallet && connected
  const canExecuteAction = !hasTokensDeposited ? 'delegate' : ''
  const canDepositToken = !hasTokensDeposited && hasTokensInWallet
  const tokensToShow =
    canDepositToken && depositTokenAccount
      ? fmtMintAmount(mint, depositTokenAccount.account.amount)
      : canDepositToken
      ? availableTokens
      : 0

  return (
    <>
      <div className="flex space-x-4 items-center mt-4">
        <div className="bg-bkg-1 px-4 py-2 rounded-md w-full">
          <p className="text-fgd-3 text-xs">{depositTokenName} Voting Power</p>
          <p className="font-bold mb-0 text-fgd-1 text-xl">{availableTokens}</p>
        </div>
      </div>

      <p
        className={`mt-2 opacity-70 mb-4 ml-1 text-xs ${
          canShowAvailableTokensMessage ? 'block' : 'hidden'
        }`}
      >
        You have {tokensToShow} tokens available to {canExecuteAction}.
      </p>

      <Tooltip content="This address will receive all your voting power to be used in governance voting and proposal.">
        <label className="border- mt-4 border-dashed border-fgd-3 inline-block leading-4 text-fgd-1 text-sm hover:cursor-help hover:border-b-0">
          Address to receive voting power
        </label>
      </Tooltip>

      <Input
        className="mt-1.5"
        value={comment}
        type="text"
        onChange={(e) => setComment(e.target.value)}
      />

      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0 mt-6">
        <Button
          tooltipMessage={depositTooltipContent}
          className="sm:w-1/2"
          disabled={!connected || !hasTokensInWallet}
          onClick={delegateAllTokens}
        >
          Delegate
        </Button>

      </div>
    </>
  )
}

export default DelegationCard