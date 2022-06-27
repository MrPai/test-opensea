import { Command, CreateCommandParameters, program } from '@caporal/core'
import {
  avgEraPoints,
  getApi,
  getIdentityOf,
  getNominatorAPY,
  getRelayApi,
  medianEraPoints,
  totalEraPoints
} from '../../utils'
import { BN } from '@polkadot/util'
import { filter, orderBy, map, pick } from 'lodash'
import { u16, Vec } from '@polkadot/types'

const TRUSTED_VALIDATORS = [
  'ZUG CAPITAL',
  'P2P.ORG',
  'WEI',
  'JACO',
  'POLKACHU.COM',
  'PARANODES.IO',
  'STAKER SPACE',
  'RYABINA',
  'STAKE-OPS',
  'MISSION CONTROL',
  'POS.DOG'
]

// Kusama
//
// yarn start get best-validators --min-stakes 4000 --max-stakes 5500 --relay-ws wss://kusama-rpc.polkadot.io --para-ws wss://heiko-rpc.parallel.fi
//
// Polkadot
//
// yarn start get best-validators --min-stakes 1600000 --max-stakes 2500000 --relay-ws wss://rpc.polkadot.io --para-ws wss://rpc.parallel.fi

const COMMISSION_TOLERANCE = '5000000' // 0.5%

export default function ({ createCommand }: CreateCommandParameters): Command {
  return createCommand('get best validators')
    .option('-r, --relay-ws [url]', 'the relaychain API endpoint', {
      default: 'wss://kusama-rpc.polkadot.io'
    })
    .option('-p, --para-ws [url]', 'the parachain API endpoint', {
      default: 'wss://heiko-rpc.parallel.fi'
    })
    .option('--max-stakes [number]', 'the maximum stakes', {
      validator: program.NUMBER,
      default: 5500
    })
    .option('--min-stakes [number]', 'the minimum stakes', {
      validator: program.NUMBER,
      default: 2000
    })
    .option('-l, --limit [number]', 'the limited number of validators', {
      validator: program.NUMBER,
      default: 24
    })
    .action(async (actionParameters) => {
      const {
        logger,
        options: { relayWs, paraWs, maxStakes, minStakes, limit }
      } = actionParameters
      const relayApi = await getRelayApi(relayWs.toString())
      const api = await getApi(paraWs.toString())
      const stashes = await relayApi.derive.staking.stashes()
      const accounts = await relayApi.derive.staking.accounts(stashes)
      const eras = await relayApi.derive.staking.erasHistoric(false)
      const allEraPoints = await relayApi.derive.staking._erasPoints(
        eras,
        false
      )
      const minCommission = await relayApi.query.staking.minCommission()
      const properties = await relayApi.rpc.system.properties()
      const decimal = 10 ** properties.tokenDecimals.unwrap()[0].toNumber()
      const chain = await relayApi.rpc.system.chain()
      const derivativeIndexList = api.consts.liquidStaking
        .derivativeIndexList as unknown as Vec<u16>
      const perNominators = Math.ceil(
        (limit.valueOf() as number) / derivativeIndexList.length
      )

      const allValidators = await Promise.all(
        stashes.map(async (s, i) => {
          const eraPoints = allEraPoints.reduce((ite, cur) => {
            if (cur.validators[s.toString()]) {
              ite.push(cur.validators[s.toString()].toNumber())
            }
            return ite
          }, [])
          const { exposure } = await relayApi.derive.staking.query(s, {
            withExposure: true
          })
          const name = await getIdentityOf(relayApi, s)
          return {
            stashId: s,
            controllerId: accounts[i].controllerId,
            prefs: accounts[i].validatorPrefs,
            stakes: exposure.total.toBn().div(new BN(decimal)).toNumber(),
            name,
            avgEraPoints: avgEraPoints(eraPoints),
            medianEraPoints: medianEraPoints(eraPoints),
            totalEraPoints: totalEraPoints(eraPoints)
          }
        })
      )

      const notBadValidators = await Promise.all(
        map(
          filter(
            allValidators,
            (v) =>
              !!v.name &&
              !v.prefs.blocked.toJSON() &&
              v.prefs.commission
                .toBn()
                .sub(minCommission.toBn())
                .lte(new BN(COMMISSION_TOLERANCE)) &&
              v.stakes > (minStakes.valueOf() as number) &&
              v.stakes < (maxStakes.valueOf() as number) &&
              TRUSTED_VALIDATORS.some((trusted) =>
                v.name.toUpperCase().includes(trusted)
              )
          ),
          async (v) => ({
            ...v,
            apy: await getNominatorAPY(
              chain.toString().toLowerCase(),
              v.stashId.toString()
            )
          })
        )
      )

      const bestValidators = map(
        orderBy(
          notBadValidators,
          ['avgEraPoints', 'medianEraPoints', 'totalEraPoints', 'stakes'],
          ['desc', 'desc', 'desc', 'asc']
        ).slice(0, limit.valueOf() as number),
        (v) =>
          pick(v, [
            'stashId',
            'name',
            'stakes',
            'apy',
            'avgEraPoints',
            'medianEraPoints',
            'totalEraPoints'
          ])
      )

      const call = []
      for (let i = 0; i < bestValidators.length; i += perNominators) {
        const targets = map(bestValidators.slice(i, i + perNominators), (v) =>
          v.stashId.toString()
        )
        const tx = api.tx.liquidStaking.nominate(
          derivativeIndexList.shift(),
          targets
        )
        call.push(tx)
      }

      const proposal = api.tx.utility.batchAll(call)
      const tx = api.tx.generalCouncil.propose(2, proposal, 1024)
      logger.info(JSON.stringify(bestValidators, null, 4))
      logger.info(`nominate: ${tx.toHex()}`)
      process.exit(0)
    })
}
