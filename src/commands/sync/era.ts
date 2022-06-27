import {
  getApi,
  getCurrentEra,
  getEraProgress,
  getRelayApi,
  getSignerOrDefault,
  handleError,
  LOCK,
  signAndSend
} from '../../utils'
import { Command, CreateCommandParameters } from '@caporal/core'
import { logger } from '../../logger'
import { EraIndex, PersistedValidationData } from '@polkadot/types/interfaces'
import { Option } from '@polkadot/types'

const STAKING_LEDGER_UPDATE_MIN_THRESHOLD = 0.4
const STAKING_LEDGER_UPDATE_MAX_THRESHOLD = 0.75

export default function ({ createCommand }: CreateCommandParameters): Command {
  return createCommand('sync relaychain era to parachain')
    .option('-r, --relay-ws [url]', 'the relaychain API endpoint', {
      default: 'ws://127.0.0.1:9944'
    })
    .option('-p, --para-ws [url]', 'the parachain API endpoint', {
      default: 'ws://127.0.0.1:9948'
    })
    .option('-k, --keystore-path [path]', 'the keystore path', {
      default: ''
    })
    .action(async (actionParameters) => {
      const {
        options: { relayWs, paraWs, keystorePath }
      } = actionParameters
      const relayApi = await getRelayApi(relayWs.toString())
      const api = await getApi(paraWs.toString())
      const signer = await getSignerOrDefault(keystorePath.toString())

      api.queryMulti(
        [
          api.query.liquidStaking.validationData,
          api.query.liquidStaking.currentEra
        ],
        async ([validationDataOp, paraEra]: [
          Option<PersistedValidationData>,
          EraIndex
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
            eraProgress >= STAKING_LEDGER_UPDATE_MIN_THRESHOLD &&
            eraProgress <= STAKING_LEDGER_UPDATE_MAX_THRESHOLD
          ) {
            return
          }

          const [relayEra, proof] = await getCurrentEra(
            relayApi,
            relayChainBlockNumber
          )
          const tx = api.tx.liquidStaking.setCurrentEra(relayEra, proof)
          return (
            relayEra.toBn().gt(paraEra.toBn()) &&
            LOCK.tryAcquire() &&
            logger.info(`Set new era: ${relayEra.toNumber()}`) &&
            (await signAndSend(signer, api, tx)
              .catch(handleError)
              .finally(() => LOCK.release()))
          )
        }
      )
    })
}
