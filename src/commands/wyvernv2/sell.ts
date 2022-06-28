
  import { Command, CreateCommandParameters } from '@caporal/core'
  import Web3 from 'web3'
import { OpenSeaSDK, Network } from 'opensea-js'
  
  export default function ({ createCommand }: CreateCommandParameters): Command {
    return createCommand('test')
      .option('-k, --keystore-path [path]', 'the keystore path', {
        default: ''
      })
      .action(async (actionParameters) => {
        const {
          options: { _keystorePath }
        } = actionParameters

        console.log("wyvern v2 sell");

        // This example provider won't let you make transactions, only read-only calls:
        const NODE_API_KEY = process.env.INFURA_KEY || process.env.ALCHEMY_KEY
        const url = 'https://rinkeby.infura.io/v3/'+NODE_API_KEY
        console.log(url);

        const provider = new Web3.providers.HttpProvider(url)
        
        const openseaSDK = new OpenSeaSDK(provider, {
        networkName: Network.Rinkeby
        })

        const accountAddress = "0x00B61eDb482beD076255a20CfB093f342677bDCf";

        const balanceOfWETH = await openseaSDK.getTokenBalance({
          accountAddress, // string
          tokenAddress: "0xD9BA894E0097f8cC2BBc9D24D308b98e36dc6D02"// Compound USDT
        })
  
        console.log(balanceOfWETH)

        // const asset = {
        //     tokenAddress: "0x06012c8cf97bead5deae237070f9587f8e7a266d", // CryptoKitties
        //     tokenId: "1", // Token ID
        //   }
          
        // const balance = await openseaSDK.getAssetBalance({
        // accountAddress, // string
        // asset, // Asset
        // })

        
    
      })
  }
  
