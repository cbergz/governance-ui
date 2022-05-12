import type { EndpointTypes } from '@models/types'
import { Connection } from '@solana/web3.js'
import type { EndpointInfo } from '../@types/types'

const ENDPOINTS: EndpointInfo[] = [
  {
    name: 'mainnet',
<<<<<<< HEAD
    url:
      process.env.MAINNET_RPC ||
      'https://wild-empty-sunset.solana-mainnet.quiknode.pro/58b024b787bbbe155d39de4ae5e789ac63ed1982/',
=======
    url: process.env.MAINNET_RPC || 'https://api.dao.solana.com/',
>>>>>>> dd80e6efc1aff829acb7528e9dc8e317b3c579f3
  },
  {
    name: 'devnet',
    url:
      process.env.DEVNET_RPC ||
      'https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899',
  },
  {
    name: 'localnet',
    url: 'http://127.0.0.1:8899',
  },
]

console.log('deployed ENDPOINTS:', ENDPOINTS)

export interface ConnectionContext {
  cluster: EndpointTypes
  current: Connection
  endpoint: string
}

export function getConnectionContext(cluster: string): ConnectionContext {
  const ENDPOINT = ENDPOINTS.find((e) => e.name === cluster) || ENDPOINTS[0]
  return {
    cluster: ENDPOINT!.name as EndpointTypes,
    current: new Connection(ENDPOINT!.url, 'recent'),
    endpoint: ENDPOINT!.url,
  }
}
