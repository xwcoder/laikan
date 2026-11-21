import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import _get from 'lodash.get'
import _set from 'lodash.set'
import { readJSON, writeJSONAtomically } from '@/base/node/fs'
import { defaultTheme, isTheme } from '@/base/common/themes'
import { Settings } from '@/types/settings'

const emitter = new EventEmitter()
const settingsFilePath = join(app.getPath('userData'), 'settings.json')

type StoredSettings = Omit<Settings, 'locale'> & { locale: string }

const saved = readJSON(settingsFilePath)
let settings: StoredSettings = {
  locale: '',
  appearance: 'auto',
  defaultDataPath: app.getPath('userData'),
  dataPath: app.getPath('userData'),
  ...saved,
  theme: isTheme(saved?.theme) ? saved.theme : defaultTheme,
}

export const get = (path?: string) => path ? _get(settings, path) : settings

export const set = (path: string, value: any) => {
  if (path === 'theme' && !isTheme(value)) throw new TypeError('Unknown theme')
  const oldValue = get(path)

  const nextSettings = structuredClone(settings)
  _set(nextSettings, path, value)
  writeJSONAtomically(settingsFilePath, nextSettings)
  settings = nextSettings

  if (oldValue !== value) {
    emitter.emit('change', path, value, oldValue)
  }
}

type changeListener = (path: string, newValue: any, oldValue: any) => void

export const on = (eventName: 'change', listener: changeListener): EventEmitter => emitter.on(eventName, listener)

app.whenReady()
  .then(() => {
    settings.locale = settings.locale || app.getLocale()
  })
