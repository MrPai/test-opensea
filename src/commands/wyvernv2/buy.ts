
  import { Command, CreateCommandParameters } from '@caporal/core'
  
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
        console.log(relayWs);
        console.log(paraWs);
        console.log(keystorePath);
        console.log("wyvern v2 buy");
        
      })
  }
  
