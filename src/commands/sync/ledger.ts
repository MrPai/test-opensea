import {
  getApi,
  getEraProgress,
  getRelayApi,
  getRelayStakingLedger,
  getSignerOrDefault,
  handleError,
  LOCK,
  signAndSend
} from '../../utils'
import { Command, CreateCommandParameters, program } from '@caporal/core'
import { logger } from '../../logger'
import {
  ParaId,
  PersistedValidationData,
  StakingLedger
} from '@polkadot/types/interfaces'
import { Option } from '@polkadot/types'

const STAKING_LEDGER_UPDATE_MIN_THRESHOLD = 0.4
const STAKING_LEDGER_UPDATE_MAX_THRESHOLD = 0.75

export default function ({ createCommand }: CreateCommandParameters): Command {
  return createCommand('sync relaychain ledger to parachain')
    .option('-r, --relay-ws [url]', 'the relaychain API endpoint', {
      default: 'ws://127.0.0.1:9944'
    })
    .option('-p, --para-ws [url]', 'the parachain API endpoint', {
      default: 'ws://127.0.0.1:9948'
    })
    .option('-k, --keystore-path [path]', 'the keystore path', {
      default: ''
    })
    .option('-i, --derivative-index [index]', 'the derivative index', {
      validator: program.NUMBER,
      default: 0
    })
    .action(async (actionParameters) => {
      const {
        options: { relayWs, paraWs, derivativeIndex, keystorePath }
      } = actionParameters
      const relayApi = await getRelayApi(relayWs.toString())
      const api = await getApi(paraWs.toString())

      const idx = derivativeIndex.valueOf() as number
      const signer = await getSignerOrDefault(keystorePath.toString())
      const paraId =
        (await api.query.parachainInfo.parachainId()) as unknown as ParaId

      api.queryMulti(
        [
          api.query.liquidStaking.validationData,
          [api.query.liquidStaking.stakingLedgers, idx]
        ],
        async ([validationDataOp, paraLedgerOp]: [
          Option<PersistedValidationData>,
          Option<StakingLedger>
        ]) => {
          if (validationDataOp.isNone) {
            return
          }

          const xcmRequests = await api.query.liquidStaking.xcmRequests.keys()
          if (xcmRequests.length) {
            return
          }

          const validationData = validationDataOp.unwrap()
          const relayChainBlockNumber = validationData.relayParentNumber.toBn()
          const eraProgress = await getEraProgress(relayChainBlockNumber, api)
          logger.info(`era progress: ${eraProgress}`)
          if (
            Number.isNaN(eraProgress) ||
            eraProgress < STAKING_LEDGER_UPDATE_MIN_THRESHOLD ||
            eraProgress > STAKING_LEDGER_UPDATE_MAX_THRESHOLD
          ) {
            return
          }

          const [relayLedgerOp, proof] = await getRelayStakingLedger(
            relayApi,
            paraId,
            idx,
            relayChainBlockNumber
          )
          if (
            relayLedgerOp.isNone ||
            paraLedgerOp.isNone ||
            relayLedgerOp.eq(paraLedgerOp)
          ) {
            return
          }

          const relayLedger = relayLedgerOp.unwrap()
          const paraLedger = paraLedgerOp.unwrap()

          if (!relayLedger.unlocking.eq(paraLedger.unlocking)) {
            return
          }

          if (
            relayLedger.active.toBn().lte(paraLedger.active.toBn()) ||
            relayLedger.total.toBn().lte(paraLedger.total.toBn())
          ) {
            return
          }

          if (LOCK.tryAcquire()) {
            const tx = api.tx.liquidStaking.setStakingLedger(
              idx,
              relayLedger,
              proof
            )
            logger.info(
              `Set new staking ledger: ${JSON.stringify(relayLedger)}`
            ) &&
              (await signAndSend(signer, api, tx)
                .catch(handleError)
                .finally(() => LOCK.release()))
          }
        }
      )
    })
}
