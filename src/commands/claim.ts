import {
  getApi,
  getClaimable,
  getSignerOrDefault,
  handleError,
  LOCK,
  signAndSend
} from '../utils'
import { Command, CreateCommandParameters, program } from '@caporal/core'
import { EraIndex } from '@polkadot/types/interfaces'

export default function ({ createCommand }: CreateCommandParameters): Command {
  return createCommand('claim')
    .option('-p, --para-ws [url]', 'the parachain API endpoint', {
      default: 'wss://heiko-rpc.parallel.fi'
    })
    .option('-k, --keystore-path [path]', 'the keystore path', {
      default: ''
    })
    .option('-b, --batch-size [size]', 'the batch size', {
      validator: program.NUMBER,
      default: 50
    })
    .action(async (actionParameters) => {
      const {
        options: { paraWs, batchSize, keystorePath }
      } = actionParameters
      const api = await getApi(paraWs.toString())
      const signer = await getSignerOrDefault(keystorePath.toString())
      api.query.liquidStaking.currentEra(async (currentEra: EraIndex) => {
        const claimable = await getClaimable(api, currentEra)
        while (claimable.length && LOCK.tryAcquire()) {
          const calls = claimable
            .splice(0, batchSize.valueOf() as number)
            .map((accountId) => api.tx.liquidStaking.claimFor(accountId))
          const tx = api.tx.utility.batchAll(calls)
          await signAndSend(signer, api, tx)
            .catch(handleError)
            .finally(() => LOCK.release())
        }
      })
    })
}
