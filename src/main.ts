import path from 'path'
import { program } from '@caporal/core'

program
  .bin('stake-client')
  .version('v2.0.0')
  .discover(path.join(__dirname, 'commands'))

program.run().catch((err) => {
  console.log(err)
  process.exit(1)
})

