const assert = require('node:assert/strict')
const path = require('node:path')

module.exports = async function settingsModalSmoke(contents, { run, wait, click, press, snapshot }) {
  const { dialog } = require('electron')
  const window = contents.getOwnerBrowserWindow()
  const bounds = window.getBounds()
  const zoom = contents.getZoomFactor()
  const originalPicker = dialog.showOpenDialog
  const open = async () => {
    await click('[data-settings-trigger]')
    await wait('document.querySelector("[data-settings-body]")')
  }
  const closed = () => wait('!document.querySelector("[role=dialog]")')

  try {
    window.setSize(600, 600)
    await wait('innerWidth === 600 && innerHeight <= 600')
    assert.equal(await run('!!document.querySelector("[data-nav=reader], nav[aria-label=emo]")'), false)
    assert.equal(await run(`!!document.querySelector('[aria-label="Toggle light / dark theme"]')`), false)
    assert.equal(await run('document.querySelector("aside").getBoundingClientRect().left'), 0)
    assert.ok(await run('document.querySelector("[data-settings-trigger]").getBoundingClientRect().bottom <= innerHeight'))
    await open()
    const geometry = await run(`(() => {
      const modal = document.querySelector('[role=dialog]').getBoundingClientRect()
      const body = document.querySelector('[data-settings-body]')
      const close = document.querySelector('[role=dialog] > button[aria-label=Close]').getBoundingClientRect()
      return {
        width: modal.width, height: modal.height, top: modal.top, bottom: modal.bottom,
        documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
        closeTop: close.top, closeBottom: close.bottom,
        overflow: Array.from(document.querySelectorAll('body *')).filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
        scrollable: body.scrollHeight > body.clientHeight,
        fits: document.documentElement.scrollWidth <= innerWidth && close.top >= 0 && close.bottom <= innerHeight,
      }
    })()`)
    assert.ok(geometry.width <= 512)
    assert.ok(geometry.height <= 600 * 0.85 + 1)
    assert.ok(geometry.top >= 0 && geometry.bottom <= 600)
    assert.equal(geometry.scrollable, false)
    await snapshot('settings-modal-small')
    assert.equal(geometry.fits, true, JSON.stringify(geometry))
    // The compact form fits the minimum window. Zoom still requires internal scrolling.
    contents.setZoomFactor(1.75)
    await wait(`(() => {
      const body = document.querySelector('[data-settings-body]')
      body.scrollTop = body.scrollHeight
      return body.scrollTop > 0 && body.scrollWidth <= body.clientWidth
        && document.querySelector('[role=dialog] > button').getBoundingClientRect().top >= 0
    })()`)
    contents.setZoomFactor(zoom)
    await press('?', true)
    await press('g'); await press('s')
    assert.equal(await run('document.querySelectorAll("[role=dialog]").length'), 1)
    assert.equal(await run('document.querySelector("[data-tab=unread]").getAttribute("aria-pressed")'), 'true')
    await press('Escape')
    await closed()
    await wait('document.activeElement?.matches("[data-settings-trigger]")')

    await open()
    // Real pointer events exercise Radix's outside-click dismissal.
    contents.sendInputEvent({ type: 'mouseDown', x: 4, y: 40, button: 'left', clickCount: 1 })
    contents.sendInputEvent({ type: 'mouseUp', x: 4, y: 40, button: 'left', clickCount: 1 })
    await closed()
    await wait('document.activeElement?.matches("[data-settings-trigger]")')

    const activePath = await run('window.emo.fetch("/settings/get", "dataPath")')
    const draftPath = path.join(activePath, 'unapplied-directory')
    // Mock only the OS picker, leaving the real renderer -> preload -> IPC path intact.
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [draftPath] })
    await open()
    await run('document.querySelector("[data-settings-body]").scrollTop = document.querySelector("[data-settings-body]").scrollHeight')
    await click('section[aria-labelledby=path-title] button')
    await wait(`document.querySelector('input[aria-labelledby=path-title]').value === ${JSON.stringify(draftPath)}`)
    assert.equal(await run('window.emo.fetch("/settings/get", "dataPath")'), activePath)
    await click('[role=dialog] > button[aria-label=Close]')
    await closed()
    await open()
    assert.equal(await run('document.querySelector("input[aria-labelledby=path-title]").value'), activePath)
    await click('[role=dialog] > button[aria-label=Close]')
    await closed()
  } finally {
    dialog.showOpenDialog = originalPicker
    contents.setZoomFactor(zoom)
    window.setBounds(bounds)
  }
  console.log('Settings modal passed: fixed entry, compact layout, internal scrolling, Escape/outside/close dismissal, focus return and discarded directory drafts')
}
