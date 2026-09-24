import 'server-only';
import { createPublicClient, fallback, http, type Address, type PublicClient } from 'viem';
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains';

export type ChainKey = 'ethereum' | 'base' | 'arbitrum' | 'optimism' | 'polygon' | 'bsc';

type TokenDef = { symbol: string; address: Address };

export const CHAINS: Record<
  ChainKey,
  {
    label: string;
    chain: typeof mainnet;
    rpc: string;
    native: string;
    explorer: string;
    tokens: TokenDef[];
    aavePool?: Address;
    npm: Address; // Uniswap V3 NonfungiblePositionManager
    factory: Address;
  }
> = {
  ethereum: {
    label: 'Ethereum',
    chain: mainnet,
    rpc: process.env.RPC_ETHEREUM || 'https://ethereum-rpc.publicnode.com',
    native: 'ETH',
    explorer: 'https://etherscan.io',
    tokens: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
      { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
      { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
      { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
      { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' },
      { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA' },
      { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
    ],
    aavePool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    npm: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  base: {
    label: 'Base',
    chain: base as unknown as typeof mainnet,
    rpc: process.env.RPC_BASE || 'https://base-rpc.publicnode.com',
    native: 'ETH',
    explorer: 'https://basescan.org',
    tokens: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
      { symbol: 'USDbC', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' },
      { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' },
      { symbol: 'AERO', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631' },
    ],
    aavePool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    npm: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  },
  arbitrum: {
    label: 'Arbitrum',
    chain: arbitrum as unknown as typeof mainnet,
    rpc: process.env.RPC_ARBITRUM || 'https://arbitrum-one-rpc.publicnode.com',
    native: 'ETH',
    explorer: 'https://arbiscan.io',
    tokens: [
      { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
      { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
      { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
      { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' },
      { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548' },
    ],
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    npm: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  optimism: {
    label: 'Optimism',
    chain: optimism as unknown as typeof mainnet,
    rpc: process.env.RPC_OPTIMISM || 'https://optimism-rpc.publicnode.com',
    native: 'ETH',
    explorer: 'https://optimistic.etherscan.io',
    tokens: [
      { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
      { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' },
      { symbol: 'OP', address: '0x4200000000000000000000000000000000000042' },
    ],
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    npm: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  polygon: {
    label: 'Polygon',
    chain: polygon as unknown as typeof mainnet,
    rpc: process.env.RPC_POLYGON || 'https://polygon-bor-rpc.publicnode.com',
    native: 'POL',
    explorer: 'https://polygonscan.com',
    tokens: [
      { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
      { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
      { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' },
      { symbol: 'WBTC', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6' },
    ],
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    npm: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  bsc: {
    label: 'BNB Chain',
    chain: bsc as unknown as typeof mainnet,
    rpc: process.env.RPC_BSC || 'https://bsc-rpc.publicnode.com',
    native: 'BNB',
    explorer: 'https://bscscan.com',
    tokens: [
      { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955' },
      { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
      { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' },
      { symbol: 'BTCB', address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' },
    ],
    aavePool: '0x6807dc923806fE8Fd134338EABCA509979a7e0cB',
    npm: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
    factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
  },
};

export const CHAIN_KEYS = Object.keys(CHAINS) as ChainKey[];

const clients = new Map<ChainKey, PublicClient>();
export function client(key: ChainKey): PublicClient {
  let c = clients.get(key);
  if (!c) {
    const def = CHAINS[key];
    c = createPublicClient({
      chain: def.chain,
      transport: fallback([http(def.rpc, { timeout: 12_000 }), http(undefined, { timeout: 12_000 })]),
      batch: { multicall: true },
    }) as PublicClient;
    clients.set(key, c);
  }
  return c;
}

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

export const aavePoolAbi = [
  {
    type: 'function',
    name: 'getUserAccountData',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const;

export const npmAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    stateMutability: 'view',
    inputs: [{ name: 'o', type: 'address' }, { name: 'i', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
  },
  {
    type: 'function',
    name: 'collect',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
        ],
      },
    ],
    outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }],
  },
] as const;

export const factoryAbi = [
  {
    type: 'function',
    name: 'getPool',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }, { name: 'b', type: 'address' }, { name: 'fee', type: 'uint24' }],
    outputs: [{ type: 'address' }],
  },
] as const;

export const poolAbi = [
  {
    type: 'function',
    name: 'slot0',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
] as const;
