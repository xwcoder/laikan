import { gt, prerelease, valid } from 'semver'
import type { UpdateState } from '@/types/update'

export type UpdateClient = {
  check: () => Promise<string | undefined>
  install: (version: string, progress: (percent: number) => void) => Promise<void>
}

type UpdateOptions = {
  client: UpdateClient
  currentVersion: string
  notify: (state: UpdateState) => void
  report: (error: unknown) => void
}

export class UpdateManager {
  private state: UpdateState = { status: 'idle' }

  private checking?: Promise<void>

  private readonly options: UpdateOptions

  constructor(options: UpdateOptions) {
    this.options = options
  }

  get status() {
    return this.state
  }

  private setState(state: UpdateState) {
    this.state = state
    this.options.notify(state)
  }

  private async checkVersion() {
    const { client, currentVersion } = this.options
    const version = await client.check()
    return version && valid(version) && !prerelease(version) && gt(version, currentVersion) ? version : undefined
  }

  private async refresh() {
    try {
      const version = await this.checkVersion()
      if (this.state.status === 'updating') return
      if (!version) {
        if (this.state.status !== 'idle') this.setState({ status: 'idle' })
      } else if (this.state.status === 'idle' || this.state.version !== version) {
        this.setState({ status: 'available', version })
      }
    } catch (error) {
      this.options.report(error)
    }
  }

  check() {
    if (this.state.status === 'updating') return undefined
    this.checking ??= this.refresh().finally(() => { this.checking = undefined })
    return this.checking
  }

  private setProgress(percent: number) {
    if (this.state.status !== 'updating' || !Number.isFinite(percent)) return
    const progress = Math.min(100, Math.max(0, Math.floor(percent)))
    if (this.state.progress !== progress) this.setState({ ...this.state, progress })
  }

  async install() {
    if (this.state.status !== 'available' && this.state.status !== 'failed') return
    let { version } = this.state
    this.setState({ status: 'updating', version })
    try {
      await this.checking
      const candidate = await this.checkVersion()
      if (!candidate) {
        this.setState({ status: 'idle' })
        return
      }
      if (candidate !== version) {
        version = candidate
        this.setState({ status: 'updating', version })
      }
      await this.options.client.install(version, (percent) => this.setProgress(percent))
    } catch (error) {
      this.setState({ status: 'failed', version })
      this.options.report(error)
    }
  }
}
