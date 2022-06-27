import inquirer from 'inquirer'
import { encrypt, writeFile } from '../../utils'
import { Command, CreateCommandParameters } from '@caporal/core'

export default function ({ createCommand }: CreateCommandParameters): Command {
  return createCommand('create keystore')
    .option('-k, --keystore-path [path]', 'the path for storing keystore', {
      default: 'keystore'
    })
    .action(async (actionParameters) => {
      const {
        options: { keystorePath }
      } = actionParameters

      const question = {
        type: 'password',
        name: 'SURI',
        message: 'Input your SURI (12 english words)'
      }
      const suri = await inquirer
        .prompt<{ SURI: string }>([question])
        .then(({ SURI }) => SURI)
      const encrypted = await encrypt(suri)
      await writeFile(keystorePath.toString(), encrypted)
    })
}
