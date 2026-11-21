import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
await p.goto('file://' + process.cwd() + '/frame.html')
await p.screenshot({ path: 'frame.png' })
await b.close()
