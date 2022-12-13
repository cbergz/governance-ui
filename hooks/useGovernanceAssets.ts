import { GovernanceAccountType } from '@solana/spl-governance'
import { AccountType, AssetAccount } from '@utils/uiTypes/assets'
import { Instructions, PackageEnum } from '@utils/uiTypes/proposalCreationTypes'
import useGovernanceAssetsStore from 'stores/useGovernanceAssetsStore'
import useRealm from './useRealm'
import { vsrPluginsPks } from './useVotingPlugins'

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
  const { ownVoterWeight, realm, symbol, governances, config } = useRealm()

  const governedTokenAccounts: AssetAccount[] = useGovernanceAssetsStore(
    (s) => s.governedTokenAccounts
  )

  const assetAccounts = useGovernanceAssetsStore((s) =>
    s.assetAccounts.filter((x) => x.type !== AccountType.AuxiliaryToken)
  )
  const auxiliaryTokenAccounts = useGovernanceAssetsStore(
    (s) => s.assetAccounts
  ).filter((x) => x.type === AccountType.AuxiliaryToken)
  const currentPluginPk = config?.account.communityTokenConfig.voterWeightAddin
  const governancesArray = useGovernanceAssetsStore((s) => s.governancesArray)

  const getGovernancesByAccountType = (type: GovernanceAccountType) => {
    const governancesFiltered = governancesArray.filter(
      (gov) => gov.account?.accountType === type
    )
    return governancesFiltered
  }

  const getGovernancesByAccountTypes = (types: GovernanceAccountType[]) => {
    const governancesFiltered = governancesArray.filter((gov) =>
      types.some((t) => gov.account?.accountType === t)
    )
    return governancesFiltered
  }

  function canUseGovernanceForInstruction(types: GovernanceAccountType[]) {
    return (
      realm &&
      getGovernancesByAccountTypes(types).some((govAcc) =>
        ownVoterWeight.canCreateProposal(govAcc.account.config)
      )
    )
  }
  const canMintRealmCommunityToken = () => {
    const governances = getGovernancesByAccountTypes([
      GovernanceAccountType.MintGovernanceV1,
      GovernanceAccountType.MintGovernanceV2,
    ])
    return !!governances.find((govAcc) =>
      realm?.account.communityMint.equals(govAcc.account.governedAccount)
    )
  }
  const canMintRealmCouncilToken = () => {
    const governances = getGovernancesByAccountTypes([
      GovernanceAccountType.MintGovernanceV1,
      GovernanceAccountType.MintGovernanceV2,
    ])

    return !!governances.find(
      (x) =>
        x.account.governedAccount.toBase58() ==
        realm?.account.config.councilMint?.toBase58()
    )
  }
  const canUseTransferInstruction = governedTokenAccounts.some((acc) => {
    const governance = governancesArray.find(
      (x) => acc.governance.pubkey.toBase58() === x.pubkey.toBase58()
    )
    return (
      governance &&
      ownVoterWeight.canCreateProposal(governance?.account?.config)
    )
  })

  const canUseProgramUpgradeInstruction = canUseGovernanceForInstruction([
    GovernanceAccountType.ProgramGovernanceV1,
    GovernanceAccountType.ProgramGovernanceV2,
  ])

  const canUseMintInstruction = canUseGovernanceForInstruction([
    GovernanceAccountType.MintGovernanceV1,
    GovernanceAccountType.MintGovernanceV2,
  ])

  const canUseAnyInstruction =
    realm &&
    governancesArray.some((gov) =>
      ownVoterWeight.canCreateProposal(gov.account.config)
    )

  const realmAuth =
    realm &&
    governancesArray.find(
      (x) => x.pubkey.toBase58() === realm.account.authority?.toBase58()
    )
  const canUseAuthorityInstruction =
    realmAuth && ownVoterWeight.canCreateProposal(realmAuth?.account.config)

  const governedSPLTokenAccounts = governedTokenAccounts.filter(
    (x) => x.type === AccountType.TOKEN
  )
  const governedTokenAccountsWithoutNfts = governedTokenAccounts.filter(
    (x) => x.type !== AccountType.NFT
  )
  const governedNativeAccounts = governedTokenAccounts.filter(
    (x) => x.type === AccountType.SOL
  )
  const nftsGovernedTokenAccounts = governedTokenAccounts.filter(
    (govTokenAcc) =>
      govTokenAcc.type === AccountType.NFT ||
      govTokenAcc.type === AccountType.SOL
  )
  const canUseTokenTransferInstruction = governedTokenAccountsWithoutNfts.some(
    (acc) => {
      const governance = governancesArray.find(
        (x) => acc.governance.pubkey.toBase58() === x.pubkey.toBase58()
      )
      return (
        governance &&
        ownVoterWeight.canCreateProposal(governance?.account?.config)
      )
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
    [PackageEnum.Castle]: {
      name: 'Castle',
      image: '/img/castle.png',
    },
    [PackageEnum.Common]: {
      name: 'Common',
    },
    [PackageEnum.Dual]: {
      name: 'Dual Finance',
      image: '/img/dual-logo.png',
    },
    [PackageEnum.Everlend]: {
      name: 'Everlend',
      image: '/img/everlend.png',
    },
    [PackageEnum.Foresight]: {
      name: 'Foresight',
      isVisible: symbol === 'FORE',
      image: '/img/foresight.png',
    },
    [PackageEnum.Friktion]: {
      name: 'Friktion',
      image: '/img/friktion.png',
    },
    [PackageEnum.GatewayPlugin]: {
      name: 'Gateway Plugin',
      image: '/img/civic.svg',
    },
    [PackageEnum.GoblinGold]: {
      name: 'Goblin Gold',
      image: '/img/goblingold.png',
    },
    [PackageEnum.Identity]: {
      name: 'Identity',
      image: '/img/identity.png',
    },
    [PackageEnum.NftPlugin]: {
      name: 'NFT Plugin',
    },
    [PackageEnum.MangoMarketV3]: {
      name: 'Mango Market v3',
      isVisible: symbol === 'MNGO',
      image: '/img/mango.png',
    },
    [PackageEnum.MangoMarketV4]: {
      name: 'Mango Market v4',
      isVisible: symbol === 'MNGO',
      image: '/img/mango.png',
    },
    [PackageEnum.MeanFinance]: {
      name: 'Mean Finance',
      image: '/img/meanfinance.png',
    },
    [PackageEnum.Serum]: {
      name: 'Serum',
      image: '/img/serum.png',
      // Temporary:
      // Hide serum package for now, due to wallet disconnection bug
      isVisible: false,
    },
    [PackageEnum.Solend]: {
      name: 'Solend',
      image: '/img/solend.png',
    },
    [PackageEnum.Streamflow]: {
      name: 'Streamflow',
      image: '/img/streamflow.png',
    },
    [PackageEnum.Switchboard]: {
      name: 'Switchboard',
      image: '/img/switchboard.png',
    },
    [PackageEnum.VsrPlugin]: {
      name: 'Vsr Plugin',
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
       ██████  █████  ███████ ████████ ██      ███████ 
      ██      ██   ██ ██         ██    ██      ██      
      ██      ███████ ███████    ██    ██      █████   
      ██      ██   ██      ██    ██    ██      ██      
       ██████ ██   ██ ███████    ██    ███████ ███████ 
    */

    [Instructions.DepositIntoCastle]: {
      name: 'Deposit into Vault',
      packageId: PackageEnum.Castle,
    },
    [Instructions.WithdrawFromCastle]: {
      name: 'Withdraw from Vault',
      packageId: PackageEnum.Castle,
    },

    /*
        ██████  ██████  ███    ███ ███    ███  ██████  ███    ██ 
       ██      ██    ██ ████  ████ ████  ████ ██    ██ ████   ██ 
       ██      ██    ██ ██ ████ ██ ██ ████ ██ ██    ██ ██ ██  ██ 
       ██      ██    ██ ██  ██  ██ ██  ██  ██ ██    ██ ██  ██ ██ 
        ██████  ██████  ██      ██ ██      ██  ██████  ██   ████
     */

    [Instructions.Base64]: {
      name: 'Execute Custom Instruction',
      packageId: PackageEnum.Common,
    },
    [Instructions.ChangeMakeDonation]: {
      name: 'Donation to Charity',
      packageId: PackageEnum.Common,
    },
    [Instructions.Clawback]: {
      name: 'Clawback',
      isVisible:
        canUseTokenTransferInstruction &&
        currentPluginPk &&
        vsrPluginsPks.includes(currentPluginPk.toBase58()),
      packageId: PackageEnum.Common,
    },
    [Instructions.CloseTokenAccount]: {
      name: 'Close token account',
      isVisible: canUseTransferInstruction,
      packageId: PackageEnum.Common,
    },
    [Instructions.CreateAssociatedTokenAccount]: {
      name: 'Create Associated Token Account',
      packageId: PackageEnum.Common,
    },
    // {
    //   id: Instructions.JoinDAO,
    //   name: 'Join a DAO',
    //   isVisible: canUseAnyInstruction,
    // },
    {
      id: Instructions.Base64,
      name: 'Execute Custom Instruction',
      isVisible: canUseAnyInstruction,
    },
    // {
    //   id: Instructions.VotingMintConfig,
    //   name: 'Vote Escrowed Tokens: Configure Voting Mint',
    //   isVisible: canUseAuthorityInstruction,
    // },
    // {
    //   id: Instructions.CreateVsrRegistrar,
    //   name: 'Vote Escrowed Tokens: Create Registrar',
    //   isVisible: canUseAuthorityInstruction,
    // },
    // {
    //   id: Instructions.ChangeMakeDonation,
    //   name: 'Change: Donation to Charity',
    //   isVisible: canUseAnyInstruction,
    // },
    {
      id: Instructions.ProgramUpgrade,
      name: 'Upgrade Program',
      isVisible: canUseProgramUpgradeInstruction,
      packageId: PackageEnum.Common,
    },
    // {
    //   id: Instructions.CreateNftPluginRegistrar,
    //   name: 'Create NFT plugin registrar',
    //   isVisible: canUseAuthorityInstruction,
    // },
    // {
    //   id: Instructions.ConfigureNftPluginCollection,
    //   name: 'Configure NFT plugin collection',
    //   isVisible: canUseAuthorityInstruction,
    // },
    // {
    //   id: Instructions.CreateGatewayPluginRegistrar,
    //   name: 'Civic: Create Gateway plugin registrar',
    //   isVisible: canUseAuthorityInstruction,
    // },
    // {
    //   id: Instructions.ConfigureGatewayPlugin,
    //   name: 'Civic: Configure existing Gateway plugin',
    //   isVisible: canUseAuthorityInstruction,
    // },
    {
      id: Instructions.RealmConfig,
      name: 'Realm config',
      isVisible: canUseAuthorityInstruction,
    },
    // {
    //   id: Instructions.CreateNftPluginMaxVoterWeight,
    //   name: 'Create NFT plugin max voter weight',
    //   isVisible: canUseAuthorityInstruction,
    // },
    {
      id: Instructions.CloseTokenAccount,
      name: 'Close token account',
      isVisible: canUseTransferInstruction,
      packageId: PackageEnum.Dual,
    },

    /*
      ███████ ██    ██ ███████ ██████  ██      ███████ ███    ██ ██████  
      ██      ██    ██ ██      ██   ██ ██      ██      ████   ██ ██   ██ 
      █████   ██    ██ █████   ██████  ██      █████   ██ ██  ██ ██   ██ 
      ██       ██  ██  ██      ██   ██ ██      ██      ██  ██ ██ ██   ██ 
      ███████   ████   ███████ ██   ██ ███████ ███████ ██   ████ ██████  
    */

    [Instructions.EverlendDeposit]: {
      name: 'Deposit Funds',
      packageId: PackageEnum.Everlend,
    },
    [Instructions.EverlendWithdraw]: {
      name: 'Withdraw Funds',
      packageId: PackageEnum.Everlend,
    },
    // {
    //   id: Instructions.SagaPreOrder,
    //   name: 'Pre-order Saga Phone',
    //   isVisible: canUseTokenTransferInstruction,
    // },
    // {
    //   id: Instructions.StakeValidator,
    //   name: 'Stake A Validator',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.DeactivateValidatorStake,
    //   name: 'Deactivate validator stake',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.WithdrawValidatorStake,
    //   name: 'Withdraw validator stake',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.TransferDomainName,
    //   name: 'SNS Transfer Out Domain Name',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.EverlendDeposit,
    //   name: 'Everlend Deposit Funds',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.EverlendWithdraw,
    //   name: 'Everlend Withdraw Funds',
    //   isVisible: canUseAnyInstruction,
    // },
    {
      id: Instructions.None,
      name: 'None',
      isVisible:
        realm &&
        Object.values(governances).some((g) =>
          ownVoterWeight.canCreateProposal(g.account.config)
        ),
    },
  ]
  const foresightInstructions = [
    // {
    //   id: Instructions.ForesightInitMarket,
    //   name: 'Foresight: Init Market',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.ForesightInitMarketList,
    //   name: 'Foresight: Init Market List',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.ForesightInitCategory,
    //   name: 'Foresight: Init Category',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.ForesightResolveMarket,
    //   name: 'Foresight: Resolve Market',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.ForesightAddMarketListToCategory,
    //   name: 'Foresight: Add Market List To Category',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.ForesightSetMarketMetadata,
    //   name: 'Foresight: Set Market Metadata',
    //   isVisible: canUseAnyInstruction,
    // },
  ]

  const availableInstructions = [
    ...commonInstructions,
    // {
    //   id: Instructions.MangoChangePerpMarket,
    //   name: 'Mango: Change Perp Market',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoChangeSpotMarket,
    //   name: 'Mango: Change Spot Market',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoChangeQuoteParams,
    //   name: 'Mango: Change Quote Params',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoChangeReferralFeeParams,
    //   name: 'Mango: Change Referral Fee Params',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoChangeReferralFeeParams2,
    //   name: 'Mango: Change Referral Fee Params V2',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoChangeMaxAccounts,
    //   name: 'Mango: Change Max Accounts',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoAddOracle,
    //   name: 'Mango: Add Oracle',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoAddSpotMarket,
    //   name: 'Mango: Add Spot Market',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoCreatePerpMarket,
    //   name: 'Mango: Create Perp Market',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoSetMarketMode,
    //   name: 'Mango: Set Market Mode',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoRemoveSpotMarket,
    //   name: 'Mango: Remove Spot Market',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoRemovePerpMarket,
    //   name: 'Mango: Remove Perp Market',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoSwapSpotMarket,
    //   name: 'Mango: Swap Spot Market',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoRemoveOracle,
    //   name: 'Mango: Remove Oracle',
    //   isVisible: canUseProgramUpgradeInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoV4TokenRegister,
    //   name: 'Mango v4: Token Register',
    //   isVisible: canUseAnyInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoV4TokenEdit,
    //   name: 'Mango v4: Token Edit',
    //   isVisible: canUseAnyInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoV4TokenRegisterTrustless,
    //   name: 'Mango v4: Token Register Trustless',
    //   isVisible: canUseAnyInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoV4PerpCreate,
    //   name: 'Mango v4: Perp Create',
    //   isVisible: canUseAnyInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoV4PerpEdit,
    //   name: 'Mango v4: Perp Edit',
    //   isVisible: canUseAnyInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.MangoV4Serum3RegisterMarket,
    //   name: 'Mango v4: Serum 3 Register Market',
    //   isVisible: canUseAnyInstruction && symbol === 'MNGO',
    // },
    // {
    //   id: Instructions.DepositToMangoAccount,
    //   name: 'Mango: Deposit to mango account',
    //   isVisible: canUseTokenTransferInstruction,
    // },
    // {
    //   id: Instructions.DepositToMangoAccountCsv,
    //   name: 'Mango: Deposit to mango account with CSV',
    //   isVisible: canUseTokenTransferInstruction,
    // },
    // {
    //   id: Instructions.ClaimMangoTokens,
    //   name: 'Mango: Claim Tokens',
    //   isVisible: canUseTokenTransferInstruction,
    // },
    // {
    //   id: Instructions.DepositIntoVolt,
    //   name: 'Friktion: Deposit into Volt',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.WithdrawFromVolt,
    //   name: 'Friktion: Withdraw from Volt',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.ClaimPendingDeposit,
    //   name: 'Friktion: Claim Volt Tokens',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.ClaimPendingWithdraw,
    //   name: 'Friktion: Claim Pending Withdraw',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.DepositIntoCastle,
    //   name: 'Castle: Deposit into Vault',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.WithrawFromCastle,
    //   name: 'Castle: Withdraw from Vault',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.MeanCreateAccount,
    //   name: 'Payment Stream: New account',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.MeanFundAccount,
    //   name: 'Payment Stream: Fund account',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.MeanWithdrawFromAccount,
    //   name: 'Payment Stream: Withdraw funds',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.MeanCreateStream,
    //   name: 'Payment Stream: New stream',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.MeanTransferStream,
    //   name: 'Payment Stream: Transfer stream',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SwitchboardAdmitOracle,
    //   name: 'Switchboard: Admit Oracle to Queue',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SwitchboardRevokeOracle,
    //   name: 'Switchboard: Remove Oracle from Queue',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.DepositIntoGoblinGold,
    //   name: 'GoblinGold: Deposit into GoblinGold',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.WithdrawFromGoblinGold,
    //   name: 'GoblinGold: Withdraw from GoblinGold',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.CreateSolendObligationAccount,
    //   name: 'Solend: Create Obligation Account',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.InitSolendObligationAccount,
    //   name: 'Solend: Init Obligation Account',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.DepositReserveLiquidityAndObligationCollateral,
    //   name: 'Solend: Deposit Funds',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.RefreshSolendReserve,
    //   name: 'Solend: Refresh Reserve',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.RefreshSolendObligation,
    //   name: 'Solend: Refresh Obligation',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.WithdrawObligationCollateralAndRedeemReserveLiquidity,
    //   name: 'Solend: Withdraw Funds',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SerumInitUser,
    //   name: 'Serum: Init User Account',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SerumGrantLockedSRM,
    //   name: 'Serum: Grant Locked SRM',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SerumGrantLockedMSRM,
    //   name: 'Serum: Grant Locked MSRM',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SerumGrantVestSRM,
    //   name: 'Serum: Grant Vested SRM',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SerumGrantVestMSRM,
    //   name: 'Serum: Grant Vested MSRM',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SerumUpdateGovConfigParams,
    //   name: 'Serum: Update Governance Config Params',
    //   isVisible: canUseAnyInstruction,
    // },
    // {
    //   id: Instructions.SerumUpdateGovConfigAuthority,
    //   name: 'Serum: Update Governance Config Authority',
    //   isVisible: canUseAnyInstruction,
    // },
    ...foresightInstructions,
  ]
  return {
    assetAccounts,
    auxiliaryTokenAccounts,
    availableInstructions,
    availablePackages,
    canMintRealmCommunityToken,
    canMintRealmCouncilToken,
    canUseAuthorityInstruction,
    canUseMintInstruction,
    canUseProgramUpgradeInstruction,
    canUseTransferInstruction,
    getGovernancesByAccountType,
    getGovernancesByAccountTypes,
    getPackageTypeById,
    governancesArray,
    governedNativeAccounts,
    governedSPLTokenAccounts,
    governedTokenAccounts,
    governedTokenAccountsWithoutNfts,
    nftsGovernedTokenAccounts,
  }
}