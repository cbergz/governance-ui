import create, { State } from 'zustand'
import axios from 'axios'
import {
  getNativeTreasuryAddress,
  Governance,
  Realm,
  TOKEN_PROGRAM_ID,
  ProgramAccount,
  GovernanceAccountType,
} from '@solana/spl-governance'
import {
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  PublicKey,
  StakeProgram,
} from '@solana/web3.js'
import { AccountInfo, MintInfo } from '@solana/spl-token'
import {
  DEFAULT_NATIVE_SOL_MINT,
  DEFAULT_NFT_TREASURY_MINT,
  HIDDEN_GOVERNANCES,
  HIDDEN_TREASURES,
  WSOL_MINT,
} from '@components/instructions/tools'
import {
  AccountInfoGen,
  getMultipleAccountInfoChunked,
  MintAccount,
  parseMintAccountData,
  TokenAccount,
  TokenProgramAccount,
} from '@utils/tokens'
import { parseTokenAccountData } from '@utils/parseTokenAccountData'
import tokenPriceService from '@utils/services/tokenPrice'
import { ConnectionContext } from '@utils/connection'
import {
  AccountType,
  AccountTypeGeneric,
  AccountTypeAuxiliaryToken,
  AccountTypeMint,
  AccountTypeNFT,
  AccountTypeProgram,
  AccountTypeSol,
  AccountTypeToken,
  AssetAccount,
  GovernanceProgramAccountWithNativeTreasuryAddress,
  AccountTypeStake,
  StakeState,
} from '@utils/uiTypes/assets'
import group from '@utils/group'
import { getFilteredProgramAccounts } from '@utils/helpers'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { AxiosRequestConfig } from 'axios';

const tokenAccountOwnerOffset = 32
const programAccountOwnerOffset = 13

interface SolAccInfo {
  governancePk: PublicKey
  acc: any
  nativeSolAddress: PublicKey
}

interface GovernanceAssetsStore extends State {
  governancesArray: ProgramAccount<Governance>[]
  governedTokenAccounts: AssetAccount[]
  assetAccounts: AssetAccount[]
  loadGovernedAccounts: boolean
  loadTokenAccounts: boolean
  loadProgramAccounts: boolean
  loadMintAccounts: boolean
  setGovernancesArray: (
    connection: ConnectionContext,
    realm: ProgramAccount<Realm>,
    governances: ProgramAccount<Governance>[]
  ) => void
  getGovernedAccounts: (
    connection: ConnectionContext,
    realm: ProgramAccount<Realm>
  ) => Promise<void>
  refetchGovernanceAccounts: (
    connection: ConnectionContext,
    realm: ProgramAccount<Realm>,
    governancePk: PublicKey
  ) => Promise<void>
}

const defaultState = {
  governancesArray: [],
  assetAccounts: [],
  governedTokenAccounts: [],
  loadGovernedAccounts: false,
  loadTokenAccounts: false,
  loadProgramAccounts: false,
  loadMintAccounts: false,
}

const BATCH_SIZE = 25; // Adjust this number based on your RPC endpoint's capacity

const batchProcess = async <T, R>(
  items: T[],
  processFn: (batch: T[]) => Promise<R[]>,
  batchSize = BATCH_SIZE
): Promise<R[]> => {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processFn(batch);
    results.push(...batchResults);
    // Add a small delay between batches to prevent overwhelming the RPC
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return results;
};

interface SingleRPCResponse {
  jsonrpc: string;
  id: number;
  result: {
    account: {
      data: [string, string]; // [encodedData, encoding]
      executable: boolean;
      lamports: number;
      owner: string;
      rentEpoch: number;
    };
    pubkey: string;
  }[];
}

interface BatchRPCResponse {
  data: SingleRPCResponse[];
}

interface TokenAccountInfo {
  publicKey: PublicKey;
  account: AccountInfo;
}

class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly minInterval: number;
  private consecutiveErrors = 0;

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithBackoff(fn);
          this.consecutiveErrors = 0; // Reset error count on success
          resolve(result);
        } catch (error) {
          this.consecutiveErrors++;
          reject(error);
        }
      });
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async executeWithBackoff(
    fn: () => Promise<any>,
    attempt = 1,
    maxAttempts = 5
  ): Promise<any> {
    try {
      const now = Date.now();
      const timeToWait = Math.max(0, this.lastRequestTime + this.minInterval - now);
      
      // Add additional delay based on consecutive errors
      const additionalDelay = Math.min(this.consecutiveErrors * 1000, 5000);
      
      if (timeToWait > 0 || additionalDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, timeToWait + additionalDelay));
      }
      
      this.lastRequestTime = Date.now();
      return await fn();
    } catch (error: any) {
      if (error?.response?.status === 429 && attempt < maxAttempts) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt + this.consecutiveErrors), 30000);
        console.log(`Rate limited, waiting ${backoffTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.executeWithBackoff(fn, attempt + 1, maxAttempts);
      }
      throw error;
    }
  }

  private async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.warn('Task failed:', error);
          // Continue processing queue even if one task fails
        }
      }
    }
    this.processing = false;
  }
}

// Create rate limiter with more conservative settings
const rateLimiter = new RateLimiter(3);

const useGovernanceAssetsStore = create<GovernanceAssetsStore>((set, _get) => ({
  ...defaultState,

  setGovernancesArray: (
    connection: ConnectionContext,
    realm: ProgramAccount<Realm>,
    governances: ProgramAccount<Governance>[]
  ) => {
    const array: ProgramAccount<Governance>[] = governances.filter(
      (gov) => !HIDDEN_GOVERNANCES.has(gov.pubkey.toString())
    )

    set((s) => {
      s.governancesArray = array
    })

    _get().getGovernedAccounts(connection, realm)
  },

  getGovernedAccounts: async (connection, realm) => {
    set((s) => {
      s.loadGovernedAccounts = true
      s.loadTokenAccounts = true
      s.loadMintAccounts = true
      s.loadProgramAccounts = true
      s.governedTokenAccounts = []
      s.assetAccounts = []
    })

    const governancesArray = _get().governancesArray
    const accounts: AssetAccount[] = []
    const nativeAddresses = await Promise.all([
      ...governancesArray.map((x) =>
        getNativeTreasuryAddress(realm.owner, x.pubkey)
      ),
    ])
    const governancesWithNativeTreasuryAddress = governancesArray.map(
      (x, index) => ({
        ...x,
        nativeTreasuryAddress: nativeAddresses[index],
      })
    )
    //due to long request for mint accounts that are owned by every governance
    //we fetch
    const possibleMintAccountPks = [
      realm.account.communityMint,
      realm.account.config.councilMint,
    ].filter((x) => typeof x !== 'undefined') as PublicKey[]

    // 1 - Load token accounts behind any type of governance
    const governedTokenAccounts = await loadGovernedTokenAccounts(
      connection,
      realm,
      governancesWithNativeTreasuryAddress
    )
    // 2 - Call to fetch token prices for every token account's mints
    await tokenPriceService.fetchTokenPrices(
      governedTokenAccounts.reduce((mints, governedTokenAccount) => {
        if (!governedTokenAccount.extensions.mint?.publicKey) {
          return mints
        }

        return [
          ...mints,
          governedTokenAccount.extensions.mint.publicKey.toBase58(),
        ]
      }, [] as string[])
    )
    accounts.push(...governedTokenAccounts)
    const stakeAccounts = await loadStakeAccounts(
      connection,
      governedTokenAccounts.filter(
        (x) => x.isSol
      )
    )
    accounts.push(...stakeAccounts)

    set((s) => {
      s.loadTokenAccounts = false
      s.governedTokenAccounts = accounts
        .filter(
          (x) =>
            x.type === AccountType.TOKEN ||
            x.type === AccountType.NFT ||
            x.type === AccountType.SOL
        )
        .filter(filterOutHiddenAccounts)
      s.assetAccounts = accounts.filter(filterOutHiddenAccounts)
    })

    // 3 - Load accounts related to mint
    const mintAccounts = await loadMintGovernanceAccounts(
      connection,
      governancesWithNativeTreasuryAddress,
      possibleMintAccountPks
    )
    accounts.push(...mintAccounts)
    set((s) => {
      s.loadMintAccounts = false
      s.assetAccounts = accounts.filter(filterOutHiddenAccounts)
    })

    // 4 - Load accounts related to program governances
    const programAccounts = await getProgramAssetAccounts(
      connection,
      governancesWithNativeTreasuryAddress
    )
    accounts.push(...programAccounts)
    set((s) => {
      s.loadProgramAccounts = false
      s.assetAccounts = accounts.filter(filterOutHiddenAccounts)
    })

    // 5 - Create generic asset accounts for governance's governedAccounts that have not been handled yet
    // We do this so theses accounts may be selected
    const genericGovernances = getGenericAssetAccounts(
      governancesWithNativeTreasuryAddress.filter(
        (governance) =>
          !accounts.some((account) =>
            account.pubkey.equals(governance.account.governedAccount)
          )
      )
    )
    accounts.push(...genericGovernances)

    set((s) => {
      s.loadGovernedAccounts = false
      s.assetAccounts = accounts.filter(filterOutHiddenAccounts)
    })
  },
  refetchGovernanceAccounts: async (
    connection: ConnectionContext,
    realm: ProgramAccount<Realm>,
    governancePk: PublicKey
  ) => {
    set((s) => {
      s.loadGovernedAccounts = false
    })

    const governancesArray = _get().governancesArray.filter((x) =>
      x.pubkey.equals(governancePk)
    )

    const previousAccounts = _get().assetAccounts.filter(
      (x) => !x.governance.pubkey.equals(governancePk)
    )

    const accounts = await getAccountsForGovernances(
      connection,
      realm,
      governancesArray
    )

    set((s) => {
      s.loadGovernedAccounts = false
      s.governedTokenAccounts = [...previousAccounts, ...accounts]
        .filter(
          (x) =>
            x.type === AccountType.TOKEN ||
            x.type === AccountType.NFT ||
            x.type === AccountType.SOL
        )
        .filter(filterOutHiddenAccounts)
      s.assetAccounts = [...previousAccounts, ...accounts].filter(
        filterOutHiddenAccounts
      )
    })
  },
}))
export default useGovernanceAssetsStore

const getTokenAccountObj = async (
  governance: GovernanceProgramAccountWithNativeTreasuryAddress,
  tokenAccount: TokenProgramAccount<AccountInfo>,
  mintAccounts: TokenProgramAccount<MintInfo>[]
): Promise<AccountTypeNFT | AccountTypeToken | null> => {
  const isNftAccount =
    tokenAccount.account.mint.toBase58() === DEFAULT_NFT_TREASURY_MINT

  const mint = mintAccounts.find((x) =>
    x.publicKey.equals(tokenAccount.account.mint)
  )!

  if (isNftAccount) {
    return new AccountTypeNFT(tokenAccount, mint, governance)
  }

  if (
    mint.account.supply &&
    mint.account.supply.cmpn(1) !== 0 &&
    mint.publicKey.toBase58() !== DEFAULT_NATIVE_SOL_MINT
  ) {
    return new AccountTypeToken(tokenAccount, mint!, governance)
  }

  return null
}

const getSolAccountsObj = async (
  connection: ConnectionContext,
  accounts: AssetAccount[],
  solAccountsInfo: SolAccInfo[],
  mintAccounts: TokenProgramAccount<MintAccount>[],
  governances: GovernanceProgramAccountWithNativeTreasuryAddress[]
): Promise<AssetAccount[]> => {
  const solAccounts: AccountTypeSol[] = []

  const wsolMintAccount = mintAccounts.find(
    (x) => x.publicKey.toBase58() === WSOL_MINT
  )! // WSOL should be here

  for (const solAccountInfo of solAccountsInfo) {
    const governance = governances.find((x) =>
      x.pubkey.equals(solAccountInfo.governancePk)
    )! // Governance should be here

    const account = await getSolAccountObj(
      governance,
      connection,
      wsolMintAccount,
      accounts,
      solAccountInfo
    )

    if (account) {
      solAccounts.push(account)
    }
  }

  return solAccounts
}

// Return array without duplicates
const uniquePublicKey = (array: PublicKey[]): PublicKey[] => {
  return Array.from(
    array.reduce((mintsPks, publicKey) => {
      // Transform to string for Set to be able to identify duplicates
      mintsPks.add(publicKey.toBase58())

      return mintsPks
    }, new Set<string>())
  ).map((address) => new PublicKey(address))
}

const getTokenAssetAccounts = async (
  tokenAccounts: TokenAccountInfo[],
  governances: GovernanceProgramAccountWithNativeTreasuryAddress[],
  connection: ConnectionContext
) => {
  const accounts: AssetAccount[] = []

  const mintsPks = uniquePublicKey(
    tokenAccounts.map((tokenAccount) => tokenAccount.account.mint)
  )

  // WSOL must be in the mintsPks array
  // WSOL is used as mint for sol accounts to calculate amounts
  if (!mintsPks.some((x) => x.toBase58() === WSOL_MINT)) {
    mintsPks.push(new PublicKey(WSOL_MINT))
  }

  const govNativeSolAddress = governances.map((x) => ({
    governanceAcc: x,
    governancePk: x.pubkey,
    nativeSolAddress: x.nativeTreasuryAddress,
  }))

  const [solAccountsInfo, mintAccounts] = await Promise.all([
    getSolAccountsInfo(connection, govNativeSolAddress),
    getMintAccountsInfo(connection, mintsPks),
  ])

  for (const tokenAccount of tokenAccounts) {
    let governance = governances.find(
      (x) => x.pubkey.toBase58() === tokenAccount.account.owner.toBase58()
    )
    const nativeSolAddress = govNativeSolAddress.find((x) =>
      x.nativeSolAddress.equals(tokenAccount.account.owner)
    )?.nativeSolAddress

    if (!governance && nativeSolAddress) {
      governance = govNativeSolAddress.find((x) =>
        x.nativeSolAddress.equals(nativeSolAddress)
      )?.governanceAcc
    }

    if (governance) {
      const account = await getTokenAccountObj(
        governance!,
        tokenAccount,
        mintAccounts
      )
      if (account) {
        accounts.push(account)
      }
    }
    {
      const mint = mintAccounts.find(
        (x) => x.publicKey.toBase58() === tokenAccount.account.mint.toBase58()
      )

      if (mint) {
        const account = new AccountTypeAuxiliaryToken(tokenAccount, mint)

        if (account) {
          accounts.push(account)
        }
      }
    }
  }

  const solAccounts = await getSolAccountsObj(
    connection,
    accounts,
    solAccountsInfo,
    mintAccounts,
    governances
  )

  return [...accounts, ...solAccounts]
}

const getMintAccounts = (
  mintGovernances: GovernanceProgramAccountWithNativeTreasuryAddress[],
  mintGovernancesMintInfo: (MintInfo & { publicKey: PublicKey })[]
) => {
  const accounts: AccountTypeMint[] = []
  mintGovernancesMintInfo.forEach((mintAccountInfo, index) => {
    const mintGovernnace = mintGovernances[index]
    if (!mintAccountInfo) {
      throw new Error(
        `Missing mintAccountInfo for: ${mintGovernnace?.pubkey.toBase58()}`
      )
    }
    const account = new AccountTypeMint(mintGovernnace!, mintAccountInfo)
    if (account) {
      accounts.push(account)
    }
  })
  return accounts
}

const getProgramAssetAccounts = async (
  connection: ConnectionContext,
  governancesArray: GovernanceProgramAccountWithNativeTreasuryAddress[]
): Promise<AccountTypeProgram[]> => {
  const possibleOwnersPk = [
    ...governancesArray.map((x) => x.nativeTreasuryAddress),
    ...governancesArray
      .filter(
        (x) =>
          x.account.accountType === GovernanceAccountType.ProgramGovernanceV1 ||
          x.account.accountType === GovernanceAccountType.ProgramGovernanceV2
      )
      .map((x) => x.pubkey),
  ]

  const programs = await getProgramAccountInfo(connection, possibleOwnersPk)

  return programs.map(
    (program) =>
      new AccountTypeProgram(
        governancesArray.find(
          (x) =>
            x.pubkey.equals(program.owner) ||
            x.nativeTreasuryAddress.equals(program.owner)
        )!,
        program.programId,
        program.owner
      )
  )
}

const getGenericAssetAccounts = (
  genericGovernances: GovernanceProgramAccountWithNativeTreasuryAddress[]
): AccountTypeGeneric[] => {
  return genericGovernances.map(
    (programGov) => new AccountTypeGeneric(programGov)
  )
}

const getSolAccountObj = async (
  governance: GovernanceProgramAccountWithNativeTreasuryAddress,
  connection: ConnectionContext,
  mint: TokenProgramAccount<MintInfo>,
  accounts: AssetAccount[],
  { acc, nativeSolAddress }: SolAccInfo
): Promise<AccountTypeSol | null> => {
  if (!acc) {
    return null
  }

  const tokenAccountsOwnedBySolAccountInfo = await connection.current.getTokenAccountsByOwner(
    nativeSolAddress,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  )

  const tokenAccountsOwnedBySolAccounts = tokenAccountsOwnedBySolAccountInfo.value.map(
    ({ pubkey: publicKey, account: { data: encodedData } }) => {
      const data = Buffer.from(encodedData)
      const account = parseTokenAccountData(publicKey, data)
      return { publicKey, account }
    }
  )

  const groups = group(tokenAccountsOwnedBySolAccounts)

  const mintAccounts = (
    await Promise.all(
      groups.map((group) => {
        if (!group.length) {
          return []
        }

        return getMintAccountsInfo(
          connection,
          group.map((x) => x.account.mint)
        )
      })
    )
  ).flat()

  for (const acc of tokenAccountsOwnedBySolAccounts) {
    const account = await getTokenAccountObj(governance, acc, mintAccounts)

    if (account) {
      accounts.push(account)
    }
  }

  const minRentAmount = await connection.current.getMinimumBalanceForRentExemption(
    0
  )

  const solAccount = acc as AccountInfoGen<Buffer | ParsedAccountData>

  solAccount.lamports =
    solAccount.lamports !== 0
      ? solAccount.lamports - minRentAmount
      : solAccount.lamports

  return new AccountTypeSol(mint, nativeSolAddress, solAccount, governance)
}

const filterOutHiddenAccounts = (x: AssetAccount) => {
  const pubkey = typeof x.pubkey === 'string' ? x.pubkey : x.pubkey.toBase58()
  return (
    HIDDEN_TREASURES.findIndex((x) => x === pubkey) === -1 &&
    (!x.extensions.token ||
      !x.extensions.token?.account.isFrozen ||
      x.type !== AccountType.GENERIC)
  )
}

// Return array without duplicates
const uniqueGovernedTokenAccounts = (
  assetAccounts: AssetAccount[]
): AssetAccount[] => {
  const existing = new Set<string>()
  const deduped: AssetAccount[] = []

  for (const account of assetAccounts) {
    if (!existing.has(account.pubkey.toBase58())) {
      existing.add(account.pubkey.toBase58())
      deduped.push(account)
    }
  }

  return deduped
}

const getMintAccountsInfo = async (
  { endpoint, current: { commitment } }: ConnectionContext,
  publicKeys: PublicKey[]
): Promise<TokenProgramAccount<MintAccount>[]> => {
  const { data: mintAccountsJson } = await axios.post(
    endpoint,
    publicKeys.map((pubkey) => {
      const id = pubkey.toBase58()

      return {
        jsonrpc: '2.0',
        id,
        method: 'getAccountInfo',
        params: [
          id,
          {
            commitment,
            encoding: 'base64',
          },
        ],
      }
    })
  )

  if (!mintAccountsJson) {
    throw new Error(
      `Cannot load information about mint accounts ${publicKeys.map((x) =>
        x.toBase58()
      )}`
    )
  }

  return mintAccountsJson.map(
    ({
      result: {
        value: {
          data: [encodedData],
        },
      },
      id,
    }) => {
      const publicKey = new PublicKey(id)
      const data = Buffer.from(encodedData, 'base64')
      const account = parseMintAccountData(data)
      return { publicKey, account }
    }
  )
}

const getTokenAccountsInfo = async (
  { endpoint, current: { commitment } }: ConnectionContext,
  publicKeys: PublicKey[]
): Promise<TokenAccountInfo[]> => {
  const BATCH_SIZE = 5;
  const results: TokenAccountInfo[] = [];

  const url = new URL(endpoint);
  const apiKey = url.searchParams.get('api-key');
  const baseEndpoint = endpoint.split('?')[0];

  const axiosConfig: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
      'x-api-key': apiKey,
    } as const
  };

  console.debug('Using endpoint:', baseEndpoint);
  console.debug('Headers:', axiosConfig.headers);
  
  for (let i = 0; i < publicKeys.length; i += BATCH_SIZE) {
    const batch = publicKeys.slice(i, i + BATCH_SIZE);
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    while (retryCount < MAX_RETRIES) {
      try {
        const batchResults = await rateLimiter.schedule(async () => {
          const payload = batch.map((publicKey) => ({
            jsonrpc: '2.0',
            id: 1,
            method: 'getProgramAccounts',
            params: [
              TOKEN_PROGRAM_ID.toBase58(),
              {
                commitment,
                encoding: 'base64',
                filters: [
                  { dataSize: 165 },
                  {
                    memcmp: {
                      offset: tokenAccountOwnerOffset,
                      bytes: publicKey.toBase58(),
                    },
                  },
                ],
              },
            ],
          }));

          console.debug('Sending request with payload:', JSON.stringify(payload[0]));
          
          const response = await axios.post<BatchRPCResponse>(
            baseEndpoint,
            payload,
            axiosConfig
          );

          if (!response?.data) {
            console.warn('Empty response received');
            return [];
          }

          const responseData = Array.isArray(response.data) ? response.data : [response.data];

          const tokenAccounts: TokenAccountInfo[] = [];

          responseData.forEach((rpcResponse) => {
            if (rpcResponse?.result) {
              const results = Array.isArray(rpcResponse.result) ? rpcResponse.result : [rpcResponse.result];
              results.forEach((item) => {
                try {
                  const publicKey = new PublicKey(item.pubkey);
                  const data = Buffer.from(item.account.data[0], 'base64');
                  const account = parseTokenAccountData(publicKey, data);
                  if (account) {
                    tokenAccounts.push({ publicKey, account });
                  }
                } catch (parseError) {
                  console.warn('Error parsing token account:', parseError);
                }
              });
            } else {
              console.warn('Invalid RPC response:', rpcResponse);
            }
          });

          return tokenAccounts;
        });
        
        results.push(...batchResults);

        break;
        
      } catch (error) {
        const isAxiosError = axios.isAxiosError(error);
        if (isAxiosError) {
          console.error('Axios error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers
          });
          
          const status = error.response?.status;

          if (status == 401 || status == 403) {
            console.error('Authentication error response:', error.response?.data);
            throw new Error(`Authentication failed with status ${status}. Please check your Helius API key.`);
          }

          if (status === 429) {
            const waitTime = Math.min(1000 * Math.pow(2, retryCount), 8000); // Exponential backoff
            console.warn(`Rate limited, waiting ${waitTime}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
            continue;
          }
        }

        console.error('Error processing batch.', error);
        retryCount++

        if (retryCount === MAX_RETRIES) {
          console.error(`Failed to process batch after ${MAX_RETRIES} retries`);
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

const getSolAccountsInfo = async (
  connection: ConnectionContext,
  publicKeys: { governancePk: PublicKey; nativeSolAddress: PublicKey }[]
): Promise<SolAccInfo[]> => {
  const { data: solAccountsJson } = await axios.post<
    unknown,
    {
      data: {
        result: {
          value: null | {
            data: [string, 'base64']
          }
        }
      }[]
    }
  >(
    connection.endpoint,
    publicKeys.map((x) => ({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [
        x.nativeSolAddress.toBase58(),
        {
          commitment: connection.current.commitment,
          encoding: 'jsonParsed',
        },
      ],
    }))
  )

  if (!solAccountsJson.length) {
    return []
  }

  return (
    solAccountsJson
      .flatMap(({ result: { value } }, index: number) => {
        return {
          acc: value,
          ...publicKeys[index],
        }
      })
      // Remove null values
      .filter(({ acc }) => acc)
  )
}

const loadMintGovernanceAccounts = async (
  connection: ConnectionContext,
  governances: GovernanceProgramAccountWithNativeTreasuryAddress[],
  possibleMintAccountPks: PublicKey[]
) => {
  const nativeAccountAddresses = governances.map((x) => x.nativeTreasuryAddress)
  const possibleMintAccounts = await getMultipleAccountInfoChunked(
    connection.current,
    possibleMintAccountPks
  )
  const mintGovernances: GovernanceProgramAccountWithNativeTreasuryAddress[] = []
  const mintAccounts: (MintInfo & { publicKey: PublicKey })[] = []
  for (const index in possibleMintAccounts) {
    const possibleMintAccount = possibleMintAccounts[index]
    const pk = possibleMintAccountPks[index]
    if (possibleMintAccount) {
      const data = Buffer.from(possibleMintAccount.data)
      const parsedMintInfo = parseMintAccountData(data) as MintInfo
      const ownerGovernance = governances.find(
        (g) =>
          parsedMintInfo?.mintAuthority &&
          g.pubkey.equals(parsedMintInfo.mintAuthority)
      )
      const solAccountPk = nativeAccountAddresses.find(
        (x) =>
          parsedMintInfo?.mintAuthority &&
          x.equals(parsedMintInfo.mintAuthority)
      )
      if (ownerGovernance || solAccountPk) {
        mintGovernances.push(
          solAccountPk
            ? governances[
                nativeAccountAddresses.findIndex((x) => x.equals(solAccountPk))
              ]
            : ownerGovernance!
        )
        mintAccounts.push({ ...parsedMintInfo, publicKey: pk })
      }
    }
  }
  return getMintAccounts(mintGovernances, mintAccounts)
}

const loadGovernedTokenAccounts = async (
  connection: ConnectionContext,
  realm: ProgramAccount<Realm>,
  governancesArray: GovernanceProgramAccountWithNativeTreasuryAddress[]
): Promise<AssetAccount[]> => {
  console.log('loadGovernedTokenAccounts has been called')
  // const auxiliaryTokenAccounts: typeof AUXILIARY_TOKEN_ACCOUNTS[keyof typeof AUXILIARY_TOKEN_ACCOUNTS] = AUXILIARY_TOKEN_ACCOUNTS[
  //   realm.account.name
  // ]?.length
  //   ? AUXILIARY_TOKEN_ACCOUNTS[realm.account.name]
  //   : []
  try {
    const tokenAccountsOwnedByGovernances = uniquePublicKey([
      ...governancesArray.map((x) => x.nativeTreasuryAddress),
      ...governancesArray.map((g) => g.pubkey),
    ]);

    console.log('Starting to load governed token accounts...');

    // Process in smaller chunks with correct typing
    const tokenAccountsInfo: TokenAccountInfo[] = [];
    for (let i = 0; i < tokenAccountsOwnedByGovernances.length; i += 5) {
      const chunk = tokenAccountsOwnedByGovernances.slice(i, i + 5);
      try {
        const chunkResults = await getTokenAccountsInfo(connection, chunk);
        tokenAccountsInfo.push(...chunkResults);
        console.log(`Processed ${tokenAccountsInfo.length} token accounts so far...`);
      } catch (error) {
        console.warn('Error processing chunk:', error);
        // Continue with next chunk even if one fails
      }
    }

    // Process token assets in chunks
    const governedTokenAccounts: AssetAccount[] = [];
    for (let i = 0; i < tokenAccountsInfo.length; i += 5) {
      const chunk = tokenAccountsInfo.slice(i, i + 5);
      try {
        const chunkResults = await getTokenAssetAccounts(
          chunk,
          governancesArray,
          connection
        );
        governedTokenAccounts.push(...chunkResults);
      } catch (error) {
        console.warn('Error processing asset chunk:', error);
      }
    }

    return uniqueGovernedTokenAccounts(governedTokenAccounts);
  } catch (error) {
    console.error('Error loading governed token accounts:', error);
    throw error;
  }
}

const loadStakeAccounts = async (
  connection: ConnectionContext,
  solAccounts: AssetAccount[]
) => {
  const accountsNotYetStaked = await Promise.all(
    solAccounts.map((x) =>
      getFilteredProgramAccounts(connection.current, StakeProgram.programId, [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode([1, 0, 0, 0]),
          },
        },
        {
          memcmp: {
            offset: 44,
            bytes: x.extensions.transferAddress,
          },
        },
      ])
    )
  )
  const accountsStaked = await Promise.all(
    solAccounts.map((x) =>
      getFilteredProgramAccounts(connection.current, StakeProgram.programId, [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode([2, 0, 0, 0]),
          },
        },
        {
          memcmp: {
            offset: 44,
            bytes: x.extensions.transferAddress,
          },
        },
      ])
    )
  )
  const accountsNotYetStakedMapped = accountsNotYetStaked.flatMap((x, idx) =>
    x.map((stake) => ({ ...stake, governance: solAccounts[idx].governance }))
  )
  const accountsStakedMapped = accountsStaked.flatMap((x, idx) =>
    x.map((stake) => ({ ...stake, governance: solAccounts[idx].governance }))
  )

  return [
    ...accountsNotYetStakedMapped.map(
      (x) =>
        new AccountTypeStake(
          x.governance,
          x.publicKey,
          StakeState.Inactive,
          null,
          x.accountInfo.lamports / LAMPORTS_PER_SOL
        )
    ),
    ...accountsStakedMapped.map(
      (x) =>
        new AccountTypeStake(
          x.governance,
          x.publicKey,
          StakeState.Active,
          PublicKey.decode(x.accountInfo.data.slice(124, 124 + 32)),
          x.accountInfo.lamports / LAMPORTS_PER_SOL
        )
    ),
  ]
}

const getAccountsForGovernances = async (
  connection: ConnectionContext,
  realm: ProgramAccount<Realm>,
  governancesArray: ProgramAccount<Governance>[]
): Promise<
  (AccountTypeMint | AccountTypeProgram | AssetAccount | AccountTypeGeneric)[]
> => {
  const nativeAddresses = await Promise.all([
    ...governancesArray.map((x) =>
      getNativeTreasuryAddress(realm.owner, x.pubkey)
    ),
  ])
  const governancesWithNativeTreasuryAddress = governancesArray.map(
    (x, index) => ({
      ...x,
      nativeTreasuryAddress: nativeAddresses[index],
    })
  )
  //due to long request for mint accounts that are owned by every governance
  //we fetch
  const possibleMintAccountPks = [
    realm.account.communityMint,
    realm.account.config.councilMint,
  ].filter((x) => typeof x !== 'undefined') as PublicKey[]

  // const additionalMintAccounts =
  //   additionalPossibleMintAccounts[realm.account.name]
  // if (additionalMintAccounts) {
  //   possibleMintAccountPks.push(...additionalMintAccounts)
  // }
  // 1 - Load accounts related to program governances
  // 2 - Load token accounts behind any type of governance
  // 3 - Load accounts related to mint
  const [
    programAccounts,
    governedTokenAccounts,
    mintAccounts,
  ] = await Promise.all([
    getProgramAssetAccounts(connection, governancesWithNativeTreasuryAddress),
    loadGovernedTokenAccounts(
      connection,
      realm,
      governancesWithNativeTreasuryAddress
    ),
    loadMintGovernanceAccounts(
      connection,
      governancesWithNativeTreasuryAddress,
      possibleMintAccountPks
    ),
  ])

  // 4 - Call to fetch token prices for every token account's mints
  await tokenPriceService.fetchTokenPrices(
    governedTokenAccounts.reduce((mints, governedTokenAccount) => {
      if (!governedTokenAccount.extensions.mint?.publicKey) {
        return mints
      }

      return [
        ...mints,
        governedTokenAccount.extensions.mint.publicKey.toBase58(),
      ]
    }, [] as string[])
  )

  const accounts = [
    ...mintAccounts,
    ...programAccounts,
    ...governedTokenAccounts,
  ]

  // 5 - Create generic asset accounts for governance's governedAccounts that have not been handled yet
  // We do this so theses accounts may be selected
  const genericGovernances = getGenericAssetAccounts(
    governancesWithNativeTreasuryAddress.filter(
      (governance) =>
        !accounts.some((account) =>
          account.pubkey.equals(governance.account.governedAccount)
        )
    )
  )

  return [...accounts, ...genericGovernances]
}

// TODO BATCH ALERT
// Solution: I cant tell what this is doing. it should probably be murdered.
const getProgramAccountInfo = async (
  { endpoint, current }: ConnectionContext,
  publicKeys: PublicKey[]
): Promise<{ owner: PublicKey; programId: PublicKey }[]> => {
  let result: { owner: PublicKey; programId: PublicKey }[] = []
  try {
    const { data: executableAccountInfoJson } = await axios.post<
      unknown,
      {
        data: {
          result: {
            account: {
              data: [string, 'base64']
            }
            pubkey: string
          }[]
          id: string
        }[]
      }
    >(
      endpoint,
      publicKeys.map((publicKey) => ({
        jsonrpc: '2.0',
        id: publicKey.toBase58(),
        method: 'getProgramAccounts',
        params: [
          'BPFLoaderUpgradeab1e11111111111111111111111',
          {
            commitment: current.commitment,
            encoding: 'base64',
            filters: [
              {
                memcmp: {
                  offset: programAccountOwnerOffset,
                  bytes: publicKey.toBase58(),
                },
              },
            ],
            dataSlice: {
              offset: 0,
              length: 0,
            },
          },
        ],
      }))
    )
    if (executableAccountInfoJson && executableAccountInfoJson.length) {
      const executableDataPks = executableAccountInfoJson.reduce(
        (executableAccountInfo, { result, id }) => {
          result.forEach(({ pubkey }) => {
            const executableDataPk = new PublicKey(pubkey)
            executableAccountInfo.push({
              executableDataPk: executableDataPk,
              owner: new PublicKey(id),
            })
          })

          return executableAccountInfo
        },
        [] as { owner: PublicKey; executableDataPk: PublicKey }[]
      )
      if (executableDataPks.length) {
        const { data: programAccountInfoJson } = await axios.post<
          unknown,
          {
            data: {
              result: {
                account: {
                  data: [string, 'base64']
                }
                pubkey: string
              }[]
              id: string
            }[]
          }
        >(
          endpoint,
          executableDataPks.map((obj) => ({
            jsonrpc: '2.0',
            id: obj.owner,
            method: 'getProgramAccounts',
            params: [
              'BPFLoaderUpgradeab1e11111111111111111111111',
              {
                commitment: current.commitment,
                encoding: 'base64',
                filters: [
                  {
                    memcmp: {
                      offset: 4,
                      bytes: obj.executableDataPk.toBase58(),
                    },
                  },
                ],
                dataSlice: {
                  offset: 0,
                  length: 0,
                },
              },
            ],
          }))
        )
        if (programAccountInfoJson && programAccountInfoJson.length) {
          const programDataPks = programAccountInfoJson.reduce(
            (programAccountInfo, { result, id }) => {
              result.forEach(({ pubkey }) => {
                const programId = new PublicKey(pubkey)
                programAccountInfo.push({ programId, owner: new PublicKey(id) })
              })

              return programAccountInfo
            },
            [] as { owner: PublicKey; programId: PublicKey }[]
          )
          result = programDataPks
        }
      }
    }
  } catch (e) {
    console.log('unable to fetch programs owned by DAO', e)
  }

  return result
}