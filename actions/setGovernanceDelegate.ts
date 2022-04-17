import {
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
  } from '@solana/web3.js'
  
  import { getGovernanceProgramVersion, RpcContext } from '@solana/spl-governance'
  import { sendTransaction } from 'utils/send'
  import { withSetGovernanceDelegate } from '@solana/spl-governance'

export const setGovernanceDelegate = async (
    { connection, wallet, programId, walletPubkey }: RpcContext,
    realmPk: PublicKey,
    governingTokenMint: PublicKey,
    tokenOwnerRecord: PublicKey,
    newGovernanceDelegate: PublicKey
  ) => {
    const signers: Keypair[] = []
    const instructions: TransactionInstruction[] = []

    const programVersion = await getGovernanceProgramVersion(
        connection,
        programId
      )
    
    await withSetGovernanceDelegate(
        instructions,
        programId,
        programVersion,
        realmPk,
        governingTokenMint,
        tokenOwnerRecord,
        tokenOwnerRecord,
        newGovernanceDelegate)
    
    const transaction = new Transaction({ feePayer: walletPubkey })
    transaction.add(...instructions)

    await sendTransaction({
        transaction,
        wallet,
        connection,
        signers,
        sendingMessage: 'Setting Governance Delegate',
        successMessage: 'Governance Delegate Set',
      })
}