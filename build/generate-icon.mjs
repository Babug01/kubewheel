import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: false }
  })

  await win.loadFile(join(__dirname, 'icon-source.html'))
  win.setContentSize(1024, 1024)
  await new Promise((r) => setTimeout(r, 300))
  console.log('content size before capture:', win.getContentSize())

  let image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  console.log('raw capture size:', image.getSize())
  image = image.resize({ width: 1024, height: 1024, quality: 'best' })
  writeFileSync(join(__dirname, 'icon.png'), image.toPNG())
  console.log('wrote build/icon.png', image.getSize())

  app.quit()
})
