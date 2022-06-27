import '@polkadot/api-augment'
import inquirer from 'inquirer'
import crypto from 'crypto'
import fs from 'fs'
import BN from 'bn.js'
import AwaitLock from 'await-lock'
import axios from 'axios'
import cheerio from 'cheerio'
import { logger } from './logger'
import Keyring, { decodeAddress, encodeAddress } from '@polkadot/keyring'
import { stringToU8a, u8aConcat, bnToU8a, u8aToHex } from '@polkadot/util'
import {
  blake2AsU8a,
  cryptoWaitReady,
  xxhashAsU8a
} from '@polkadot/util-crypto'
import { Bytes, Vec, Option } from '@polkadot/types'
import {
  AccountId,
  BlockNumber,
  EraIndex,
  ParaId,
  ReadProof,
  StakingLedger,
  UnlockChunk
} from '@polkadot/types/interfaces'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { typesBundle } from '@parallel-finance/type-definitions'
import { options } from '@parallel-finance/api'
import { promisify } from 'util'
import { SubmittableExtrinsic } from '@polkadot/api/types'
import { ISubmittableResult } from '@polkadot/types/types'
import { KeyringPair } from '@polkadot/keyring/types'

const DEFAULT_SURI = '//Eve'

export const BN_ZERO = new BN(0)
export const EMPTY_U8A_32 = new Uint8Array(32)
export const IV_LENGTH = 16
export const LOCK = new AwaitLock()

export const readFile = promisify(fs.readFile)

export const writeFile = promisify(fs.writeFile)

export const exists = promisify(fs.exists)

export const sovereignAccountOf = (paraId: ParaId): string =>
  encodeAddress(
    u8aConcat(
      stringToU8a('para'),
      bnToU8a(paraId, 32, true),
      EMPTY_U8A_32
    ).subarray(0, 32)
  )

export const subAccountId = (signer: string, index: number): string => {
  const seedBytes = stringToU8a('modlpy/utilisuba')
  const whoBytes = decodeAddress(signer)
  const indexBytes = bnToU8a(index, 16).reverse()
  const combinedBytes = new Uint8Array(
    seedBytes.length + whoBytes.length + indexBytes.length
  )
  combinedBytes.set(seedBytes)
  combinedBytes.set(whoBytes, seedBytes.length)
  combinedBytes.set(indexBytes, seedBytes.length + whoBytes.length)

  const entropy = blake2AsU8a(combinedBytes, 256)
  return encodeAddress(entropy)
}

export const getApi = async (url: string): Promise<ApiPromise> => {
  return ApiPromise.create(
    options({
      types: {
        TAssetBalance: 'Balance'
      },
      typesBundle,
      provider: new WsProvider(url)
    })
  )
}

export const getRelayApi = async (url: string): Promise<ApiPromise> => {
  return ApiPromise.create({
    provider: new WsProvider(url)
  })
}

export const askPass = async (): Promise<Buffer> => {
  const questions = [
    {
      type: 'password',
      name: 'password',
      message: 'Input your keystore password'
    }
  ]
  const pass = await inquirer
    .prompt<{ password: string }>(questions)
    .then(({ password }) => password)
  return Buffer.concat([Buffer.from(pass), Buffer.alloc(32)]).slice(0, 32)
}

export const encrypt = async (msg: string): Promise<string> => {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', await askPass(), iv)
  const crypted = Buffer.concat([cipher.update(msg), cipher.final()])
  return iv.toString('hex') + ':' + crypted.toString('hex')
}

export const decrypt = async (msg: string): Promise<string> => {
  const msgParts = msg.split(':')
  const iv = Buffer.from(msgParts.shift(), 'hex')
  const encrypted = Buffer.from(msgParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', await askPass(), iv)
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])
  return decrypted.toString()
}

export const getSignerOrDefault = async (keystorePath: string) => {
  await cryptoWaitReady()
  const keyring = new Keyring({ type: 'sr25519' })
  const suri =
    keystorePath && (await exists(keystorePath))
      ? await decrypt(await readFile(keystorePath, 'utf8'))
      : DEFAULT_SURI
  return keyring.addFromUri(suri)
}

export const getCurrentEra = async (
  api: ApiPromise,
  relayChainBlockNumber: BN
): Promise<[EraIndex, Vec<Bytes>]> => {
  const storagePrefix = [
    ...xxhashAsU8a('Staking', 128),
    ...xxhashAsU8a('CurrentEra', 128)
  ]
  const storageKey = u8aToHex(new Uint8Array([...storagePrefix]))
  const relayBlockHash = await api.rpc.chain.getBlockHash(relayChainBlockNumber)
  const { proof } = (await api.rpc.state.getReadProof(
    [storageKey],
    relayBlockHash
  )) as ReadProof
  // logger.debug('fetching relaychain era & proof')
  // logger.debug(`storage key: ${storageKey}`)
  // logger.debug(`relay block hash: ${relayBlockHash.toHex()}`)
  const maybeEraIndex = (await api.query.staking.currentEra.at(
    relayBlockHash
  )) as unknown as Option<EraIndex>
  return [maybeEraIndex.unwrapOrDefault(), proof]
}

export const getRelayStakingLedger = async (
  api: ApiPromise,
  paraId: ParaId,
  derivativeIndex: number,
  relayChainBlockNumber: BN
): Promise<[Option<StakingLedger>, Vec<Bytes>]> => {
  const controllerAddress = subAccountId(
    sovereignAccountOf(paraId),
    derivativeIndex
  )
  const accountBytes = decodeAddress(controllerAddress)
  const storagePrefix = [
    ...xxhashAsU8a('Staking', 128),
    ...xxhashAsU8a('Ledger', 128)
  ]
  const accountKey = u8aConcat(blake2AsU8a(accountBytes, 128), accountBytes)
  const relayBlockHash = await api.rpc.chain.getBlockHash(relayChainBlockNumber)
  const storageKey = u8aToHex(new Uint8Array([...storagePrefix, ...accountKey]))
  // logger.debug(`fetching relaychain staking ledger & proof`)
  // logger.debug(`storage key: ${storageKey}`)
  // logger.debug(`relay block hash: ${relayBlockHash.toHex()}`)
  const { proof } = (await api.rpc.state.getReadProof(
    [storageKey],
    relayBlockHash
  )) as ReadProof
  const relayLedgerOp = (await api.query.staking.ledger.at(
    relayBlockHash,
    controllerAddress
  )) as unknown as Option<StakingLedger>
  return [relayLedgerOp, proof]
}

export const getEraProgress = async (
  relayChainBlockNumber: BN,
  api: ApiPromise
): Promise<number> => {
  const eraStartBlock =
    (await api.query.liquidStaking.eraStartBlock()) as unknown as BlockNumber
  const eraLength = api.consts.liquidStaking.eraLength as unknown as BlockNumber
  return (
    relayChainBlockNumber.sub(eraStartBlock).toNumber() / eraLength.toNumber()
  )
}

export const getClaimable = async (
  api: ApiPromise,
  currentEra: EraIndex
): Promise<string[]> => {
  const unlockings = await api.query.liquidStaking.unlockings.entries()
  return unlockings
    .map(([{ args }, value]) => {
      const accountId = args[0].toString()
      const chunks = JSON.parse(
        JSON.stringify(value)
      ) as unknown as UnlockChunk[]
      const hasUnbonded = chunks.some((chunk) =>
        currentEra.toBn().gte(new BN(chunk.era.toString()))
      )
      if (hasUnbonded) return accountId
    })
    .filter(Boolean)
}

export const signAndSend = async (
  signer: KeyringPair,
  api: ApiPromise,
  tx: SubmittableExtrinsic<'promise', ISubmittableResult>
): Promise<void> => {
  const nonce = await api.rpc.system.accountNextIndex(signer.address)
  const getErrorInfo = (event) => {
    const [dispatchError] = event.data
    let errorInfo
    if (dispatchError.isModule) {
      const decoded = api.registry.findMetaError(dispatchError.asModule)
      errorInfo = `${decoded.section}.${decoded.name}`
    } else {
      errorInfo = dispatchError.toString()
    }
    return errorInfo
  }
  return new Promise((resolve, reject) => {
    logger.info(`--------------------START--------------------`)
    tx.signAndSend(signer, { nonce }, ({ events, status }) => {
      if (status.isBroadcast) {
        logger.info('tx::broadcasting')
      }
      if (status.isInBlock) {
        logger.info('tx::inBlock')
        for (const { event } of events) {
          if (api.events.system.ExtrinsicFailed.is(event)) {
            logger.error(getErrorInfo(event))
          }
        }
      }
      if (status.isFinalized) {
        logger.info(`tx::finalized at: ${status.asFinalized.toHex()}`)
        return resolve()
      }
      if (status.isFinalityTimeout) {
        return reject(`tx::finalityTimeout`)
      }
    })
  })
}

export const getIdentityOf = async (api: ApiPromise, address: AccountId) => {
  const identity = await api.derive.accounts.identity(address)
  return (
    (identity.displayParent ? identity.displayParent + '/' : '') +
    identity.display
  )
}

export const avgEraPoints = (erasPoints: number[]): number => {
  return erasPoints.length
    ? erasPoints.reduce((ite, cur) => ite + cur, 0) / erasPoints.length
    : 0
}

export const medianEraPoints = (erasPoints: number[]): number => {
  return erasPoints.length
    ? erasPoints.sort((a, b) => (a > b ? 1 : -1))[
        Math.floor(erasPoints.length / 2)
      ]
    : 0
}

export const totalEraPoints = (erasPoints: number[]): number => {
  return erasPoints.reduce((ite, cur) => ite + cur, 0)
}

export const getNominatorAPY = async (
  chain: string,
  validator: string
): Promise<number> => {
  try {
    const resp = await axios.get(
      `https://www.polkachu.com/${chain}/validators/${validator}`
    )
    const doc = cheerio.load(resp.data)
    const text = doc.text().replace(/^\s*\n/gm, '')

    // eslint-disable-next-line no-control-regex
    const matches = new RegExp('\\s*(?:Nominator APR\\*)\n\\s*(.*)%').exec(text)
    return matches && matches.length >= 1 ? +matches[1] : 0
  } catch (e) {
    return 0
  }
}

export const handleError = (err) => {
  const errMsg = err.message || err
  errMsg && logger.error(errMsg)
}
