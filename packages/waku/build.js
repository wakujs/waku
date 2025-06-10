import { cp } from 'node:fs/promises'

await cp('../../README.md', './README.md')
