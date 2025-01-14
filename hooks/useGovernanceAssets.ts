import { AccountType, AssetAccount } from '@utils/uiTypes/assets'
import { Instructions, PackageEnum } from '@utils/uiTypes/proposalCreationTypes'
import useGovernanceAssetsStore from 'stores/useGovernanceAssetsStore'
import { HELIUM_VSR_PLUGINS_PKS, VSR_PLUGIN_PKS } from '../constants/plugins'
import { useRealmQuery } from './queries/realm'
import { useRealmConfigQuery } from './queries/realmConfig'
import { useRealmGovernancesQuery } from './queries/governance'
import { useMemo } from 'react'
import { useRealmVoterWeights } from '@hooks/useRealmVoterWeightPlugins'
import { GovernanceConfig } from '@solana/spl-governance'

type Package = {
  name: string
  image?: string
  isVisible?: boolean
}

type Packages = {
  [packageId in PackageEnum]: Package
}

type PackageType = Package & {
  id: PackageEnum
}

type Instruction = {
  name: string
  isVisible?: boolean
  packageId: PackageEnum
  assetType?: 'token' | 'mint' | 'wallet'
}

type InstructionsMap = {
  [instructionId in Instructions]: Instruction
}

export type InstructionType = {
  id: Instructions
  name: string
  packageId: PackageEnum
}

export default function useGovernanceAssets() {
  const realm = useRealmQuery().data?.result
  const config = useRealmConfigQuery().data?.result
  const { communityWeight, councilWeight } = useRealmVoterWeights()
  const ownVoterWeights = {
    community: communityWeight?.value,
    council: councilWeight?.value,
  }

  const canCreateProposal = (config: GovernanceConfig) => {
    return (
      ownVoterWeights.community?.gte(
        config.minCommunityTokensToCreateProposal
      ) || ownVoterWeights.council?.gte(config.minCouncilTokensToCreateProposal)
    )
  }

  const governedTokenAccounts: AssetAccount[] = useGovernanceAssetsStore(
    (s) => s.governedTokenAccounts
  )

  const assetAccounts = useGovernanceAssetsStore((s) =>
    s.assetAccounts.filter((x) => x.type !== AccountType.AUXILIARY_TOKEN)
  )
  const auxiliaryTokenAccounts = useGovernanceAssetsStore(
    (s) => s.assetAccounts
  ).filter((x) => x.type === AccountType.AUXILIARY_TOKEN)
  const currentPluginPk = config?.account.communityTokenConfig.voterWeightAddin
  const governancesQuery = useRealmGovernancesQuery()
  const governancesArray = useMemo(() => governancesQuery.data ?? [], [
    governancesQuery.data,
  ])

  function canUseGovernanceForInstruction(types: AccountType[]) {
    return (
      realm &&
      assetAccounts
        .filter((x) => types.find((t) => t === x.type))
        .some((govAcc) => canCreateProposal(govAcc.governance.account.config))
    )
  }
  const canMintRealmCouncilToken = () => {
    return !!assetAccounts.find(
      (x) =>
        x.pubkey.toBase58() == realm?.account.config.councilMint?.toBase58()
    )
  }
  const canUseTransferInstruction = governedTokenAccounts.some((acc) => {
    const governance = governancesArray.find(
      (x) => acc.governance.pubkey.toBase58() === x.pubkey.toBase58()
    )
    return governance && canCreateProposal(governance?.account?.config)
  })

  const canUseProgramUpgradeInstruction = canUseGovernanceForInstruction([
    AccountType.PROGRAM,
  ])

  const canUseMintInstruction = canUseGovernanceForInstruction([
    AccountType.MINT,
  ])

  const canUseAnyInstruction =
    realm &&
    governancesArray.some((gov) => canCreateProposal(gov.account.config))

  const realmAuth =
    realm &&
    governancesArray.find(
      (x) => x.pubkey.toBase58() === realm.account.authority?.toBase58()
    )
  const canUseAuthorityInstruction =
    realmAuth && canCreateProposal(realmAuth?.account.config)

  const governedSPLTokenAccounts = governedTokenAccounts.filter(
    (x) => x.type === AccountType.TOKEN
  )
  const governedTokenAccountsWithoutNfts = governedTokenAccounts.filter(
    (x) => x.type !== AccountType.NFT
  )
  const governedNativeAccounts = governedTokenAccounts.filter(
    (x) => x.type === AccountType.SOL
  )
  const canUseTokenTransferInstruction = governedTokenAccountsWithoutNfts.some(
    (acc) => {
      const governance = governancesArray.find(
        (x) => acc.governance.pubkey.toBase58() === x.pubkey.toBase58()
      )
      return governance && canCreateProposal(governance?.account?.config)
    }
  )

  // Alphabetical order
  // Images are in public/img/
  //
  // If an image is not set, then the name is displayed in the select
  // please use png with transparent background for logos
  //
  // Packages are visible by default
  const packages: Packages = {
    [PackageEnum.Common]: {
      name: 'Common',
    },
    [PackageEnum.VsrPlugin]: {
      name: 'Vsr Plugin',
      isVisible:
        currentPluginPk &&
        [...VSR_PLUGIN_PKS, ...HELIUM_VSR_PLUGINS_PKS].includes(
          currentPluginPk.toBase58()
        ),
    },
  }

  // Alphabetical order, Packages then instructions
  //
  // To generate package name comment, use:
  // https://patorjk.com/software/taag/#p=display&f=ANSI%20Regular&t=COMMON%0A
  //
  // If isVisible is not set, it is equal to canUseAnyInstruction
  const instructionsMap: InstructionsMap = {
    /*
        ██████  ██████  ███    ███ ███    ███  ██████  ███    ██
       ██      ██    ██ ████  ████ ████  ████ ██    ██ ████   ██
       ██      ██    ██ ██ ████ ██ ██ ████ ██ ██    ██ ██ ██  ██
       ██      ██    ██ ██  ██  ██ ██  ██  ██ ██    ██ ██  ██ ██
        ██████  ██████  ██      ██ ██      ██  ██████  ██   ████
     */
    [Instructions.RevokeGoverningTokens]: {
      name: 'Revoke Membership',
      packageId: PackageEnum.Common,
    },
    [Instructions.Base64]: {
      name: 'Execute Custom Instruction',
      packageId: PackageEnum.Common,
    },
    [Instructions.CloseTokenAccount]: {
      name: 'Close token account',
      isVisible: canUseTransferInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.CloseMultipleTokenAccounts]: {
      name: 'Close multiple token accounts',
      isVisible: canUseTransferInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.CreateAssociatedTokenAccount]: {
      name: 'Create Associated Token Account',
      packageId: PackageEnum.Common,
    },
    [Instructions.CreateTokenMetadata]: {
      name: 'Create Token Metadata',
      isVisible: canUseAuthorityInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.DelegateStake]: {
      name: 'Delegate Stake Account',
      packageId: PackageEnum.Common,
    },
    [Instructions.Grant]: {
      name: 'Grant',
      isVisible:
        canUseTokenTransferInstruction &&
        currentPluginPk &&
        VSR_PLUGIN_PKS.includes(currentPluginPk.toBase58()),
      packageId: PackageEnum.VsrPlugin,
    },
    [Instructions.Mint]: {
      name: 'Mint Tokens',
      isVisible: canUseMintInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.None]: {
      name: 'None',
      isVisible:
        realm &&
        governancesArray.some((g) => canCreateProposal(g.account.config)),
      packageId: PackageEnum.Common,
    },
    [Instructions.ProgramUpgrade]: {
      name: 'Upgrade Program',
      isVisible: canUseProgramUpgradeInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.RealmConfig]: {
      name: 'Realm config',
      isVisible: canUseAuthorityInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.Transfer]: {
      name: 'Transfer Tokens',
      isVisible: canUseTokenTransferInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.UpdateTokenMetadata]: {
      name: 'Update Token Metadata',
      isVisible: canUseAuthorityInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.WithdrawValidatorStake]: {
      name: 'Withdraw validator stake',
      packageId: PackageEnum.Common,
    },
    [Instructions.SetMintAuthority]: {
      name: 'Set Mint Authority',
      packageId: PackageEnum.Common,
    },
  }

  const availablePackages: PackageType[] = Object.entries(packages)
    .filter(([, { isVisible }]) =>
      typeof isVisible === 'undefined' ? true : isVisible
    )
    .map(([id, infos]) => ({
      id: Number(id) as PackageEnum,
      ...infos,
    }))

  const availableInstructions = Object.entries(instructionsMap)
    .filter(([, { isVisible, packageId }]) => {
      // do not display if the instruction's package is not visible
      if (!availablePackages.some(({ id }) => id === packageId)) {
        return false
      }

      return typeof isVisible === 'undefined' ? canUseAnyInstruction : isVisible
    })
    .map(([id, { name, packageId }]) => ({
      id: Number(id) as Instructions,
      name,
      packageId,
    }))

  const getPackageTypeById = (packageId: PackageEnum) => {
    return availablePackages.find(
      (availablePackage) => availablePackage.id === packageId
    )
  }

  return {
    assetAccounts,
    auxiliaryTokenAccounts,
    availableInstructions,
    availablePackages,
    canMintRealmCouncilToken,
    canUseAuthorityInstruction,
    canUseMintInstruction,
    canUseProgramUpgradeInstruction,
    canUseTransferInstruction,
    getPackageTypeById,
    governancesArray,
    governedNativeAccounts,
    governedSPLTokenAccounts,
    governedTokenAccounts,
    governedTokenAccountsWithoutNfts,
  }
}