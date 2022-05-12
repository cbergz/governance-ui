import useRealm from '@hooks/useRealm'
<<<<<<< HEAD
import React, { useEffect, useState } from 'react'
import useMembersStore from 'stores/useMembersStore'
import MemberOverview from '@components/Members/MemberOverview'
import { PlusCircleIcon, SearchIcon, UsersIcon } from '@heroicons/react/outline'
import useGovernanceAssets from '@hooks/useGovernanceAssets'
import Tooltip from '@components/Tooltip'
import useWalletStore from 'stores/useWalletStore'
import Modal from '@components/Modal'
import AddMemberForm from '@components/Members/AddMemberForm'
import PreviousRouteBtn from '@components/PreviousRouteBtn'
import { LinkButton } from '@components/Button'
import MembersTabs from '@components/Members/MembersTabs'
import Select from '@components/inputs/Select'
import Input from '@components/inputs/Input'
import { Member } from '@utils/uiTypes/members'

const MembersPage = () => {
  const {
    realmInfo,
    toManyCouncilOutstandingProposalsForUse,
    toManyCommunityOutstandingProposalsForUser,
  } = useRealm()
  const activeMembers = useMembersStore((s) => s.compact.activeMembers)
  const connected = useWalletStore((s) => s.connected)
  const {
    canUseMintInstruction,
    canMintRealmCouncilToken,
  } = useGovernanceAssets()
  const [activeMember, setActiveMember] = useState(activeMembers[0])
  const [openAddMemberModal, setOpenAddMemberModal] = useState(false)
  const [searchString, setSearchString] = useState('')
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([])

  const filterMembers = (v) => {
    setSearchString(v)
    if (v.length > 0) {
      const filtered = activeMembers.filter((r) =>
        r.walletAddress?.toLowerCase().includes(v.toLowerCase())
      )
      setFilteredMembers(filtered)
    } else {
      setFilteredMembers(activeMembers)
    }
  }

  const addNewMemberTooltip = !connected
    ? 'Connect your wallet to add new council member'
    : !canMintRealmCouncilToken()
    ? 'Your realm need mint governance for council token to add new member'
    : !canUseMintInstruction
    ? "You don't have enough governance power to add new council member"
    : toManyCommunityOutstandingProposalsForUser
    ? 'You have too many community outstanding proposals. You need to finalize them before creating a new council member.'
    : toManyCouncilOutstandingProposalsForUse
    ? 'You have too many council outstanding proposals. You need to finalize them before creating a new council member.'
    : ''

  useEffect(() => {
    if (activeMembers.length > 0) {
      setActiveMember(activeMembers[0])
      setFilteredMembers(activeMembers)
    }
  }, [JSON.stringify(activeMembers)])

=======
import Members from './Members'
const MembersPage = () => {
  const { realm } = useRealm()
>>>>>>> dd80e6efc1aff829acb7528e9dc8e317b3c579f3
  return (
    <div>
      {!realm?.account.config.useCommunityVoterWeightAddin ? <Members /> : null}
    </div>
  )
}

export default MembersPage
