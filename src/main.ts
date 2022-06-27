import path from 'path'
import { program } from '@caporal/core'
import { handleError } from './utils'

program
  .bin('stake-client')
  .version('v2.0.0')
  .discover(path.join(__dirname, 'commands'))

program.run().catch((err) => {
  handleError(err)
  process.exit(1)
})

process.on('unhandledRejection', handleError)
