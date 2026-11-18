import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { ConfigManager } from './config/config-manager'
import { openDatabase, type DB } from './database'
import { ConversationManager } from './ai/conversation-manager'
import { DeepSeekClient } from './ai/deepseek'
import { AgentManager } from './ai/agent-manager'
import { createToolRegistry } from './tools'
import { registerIpc } from './ipc'

let mainWindow: BrowserWindow | null = null
let db: DB | null = null
let conversations: ConversationManager | null = null
let config: ConfigManager | null = null

function isSafeExternal(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'WeatherAI',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    if (isSafeExternal(url)) void shell.openExternal(url)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

process.on('uncaughtException', (err) => console.error('[main] uncaughtException', err))
process.on('unhandledRejection', (err) => console.error('[main] unhandledRejection', err))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (app.isReady()) createWindow()
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.weatherai.desktop')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    config = new ConfigManager()
    db = openDatabase(join(app.getPath('userData'), 'weather-ai.db'))
    conversations = new ConversationManager(db)
    const cfg = config
    const registry = createToolRegistry({ getWeatherConfig: () => cfg.getWeather() })
    const ai = new DeepSeekClient(
      () => cfg.getAI(),
      () => cfg.getApiKey()
    )
    const agent = new AgentManager(ai, registry, conversations, {
      maxToolRounds: 8,
      getWeatherConfig: () => cfg.getWeather()
    })
    registerIpc({ config: cfg, conversations, agent, ai, registry })

    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  try {
    if (config && conversations && !config.getApp().autoSave) conversations.clearAll()
    db?.close()
  } catch (err) {
    console.error('[main] cleanup failed', err)
  }
})
