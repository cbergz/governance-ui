import { useState } from 'react'
import Button from '../Button'
import Input from '../inputs/Input'
import useWalletStore from '../../stores/useWalletStore'
import useRealm from '../../hooks/useRealm'
import { RpcContext } from '@solana/spl-governance'
import { PublicKey } from '@solana/web3.js'
// import { ChatMessageBody, ChatMessageBodyType } from '@solana/spl-governance'
import Loading from '../Loading'
import Tooltip from '@components/Tooltip'
import { getProgramVersionForRealm } from '@models/registry/api'
// import useVotePluginsClientStore from 'stores/useVotePluginsClientStore'
import { setGovernanceDelegate } from 'actions/setGovernanceDelegate'

const Delegation = () => {
  const [delegateeAddress, setDelegateeAddress] = useState('')
  const connected = useWalletStore((s) => s.connected)
  const {
    ownVoterWeight,
    realmInfo,
    realm } = useRealm()
//   const client = useVotePluginsClientStore(
//     (s) => s.state.currentRealmVotingClient
//   )
  const [submitting, setSubmitting] = useState(false)

  const wallet = useWalletStore((s) => s.current)
  const connection = useWalletStore((s) => s.connection)
//   const { proposal } = useWalletStore((s) => s.selectedProposal)
//   const { fetchChatMessages } = useWalletStore((s) => s.actions)

  const submitDelegation = async () => {
    setSubmitting(true)

    const rpcContext = new RpcContext(
      realm!.pubkey!,
      getProgramVersionForRealm(realmInfo!),
      wallet!,
      connection.current,
      connection.endpoint
    )

    const msg = new PublicKey(delegateeAddress)

    try {
      await setGovernanceDelegate(
        rpcContext,
        realm!.pubkey!,
        realm!.account.communityMint,
        wallet!.publicKey!,
        msg
      )

      setDelegateeAddress('')
    } catch (ex) {
      console.error("Can't delegate tokens.", ex)
      //TODO: How do we present transaction errors to users? Just the notification?
    } finally {
      setSubmitting(false)
    }

    // fetchChatMessages(proposal!.pubkey)
  }

  const delegationEnabled =
    connected && ownVoterWeight.hasAnyWeight() && delegateeAddress

  const tooltipContent = !connected
    ? 'Connect your wallet to send a comment'
    : !ownVoterWeight.hasAnyWeight()
    ? 'You need to have deposited some tokens to submit your comment.'
    : !delegateeAddress
    ? 'Enter an address to delegate'
    : ''

  return (
    <div className="bg-bkg-2 p-4 md:p-6 rounded-lg">
        <div className="flex items-center justify-between">
            <h3 className="mb-0">Delegation</h3>
        </div>
            <div className="flex flex-col md:flex-row md:items-center md:space-x-4 space-y-4 md:space-y-0">
                <Input
                value={delegateeAddress}
                type="text"
                onChange={(e) => setDelegateeAddress(e.target.value)}
                placeholder="Delegatee Address"
                />

                <Tooltip contentClassName="flex-shrink-0" content={tooltipContent}>
                <Button
                    className="flex-shrink-0"
                    onClick={() => submitDelegation()}
                    disabled={!delegationEnabled || !delegateeAddress}
                >
                    {submitting ? <Loading /> : <span>Delegate</span>}
                </Button>
                </Tooltip>
            </div>
    </div>
  )
}

export default Delegation