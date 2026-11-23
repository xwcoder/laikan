const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { dialog } = require('electron')

module.exports = async function opmlSmoke({ run, wait, openSubscriptionMenu }, base) {
  const directory = fs.mkdtempSync(path.join(process.env.YIKAN_SMOKE_USER_DATA, 'opml-'))
  const importPath = path.join(directory, '订阅.xml')
  const exportPath = path.join(directory, 'subscriptions.opml')
  let selectedPath = importPath
  let pickerGate
  const openPicker = dialog.showOpenDialog
  const savePicker = dialog.showSaveDialog
  const busy = `document.querySelector('[aria-label="Manage subscriptions"] .animate-spin')`
  const statusText = `Array.from(document.querySelectorAll('aside [role=status]'), element => element.textContent.trim()).join('')`
  const choose = async (label) => {
    let releasePicker
    pickerGate = new Promise(resolve => { releasePicker = resolve })
    try {
      await openSubscriptionMenu()
      await run(`Array.from(document.querySelectorAll('[role=menuitem]'))
        .find(item => item.textContent.trim() === ${JSON.stringify(label)}).click()`)
      await wait(busy)
      assert.equal(await run(statusText), '', 'OPML operations have no progress text')
    } finally {
      releasePicker()
    }
    await wait(`!${busy}`)
    assert.equal(await run(statusText), '', 'OPML operations have no completion text')
  }
  const feeds = () => run('window.yikan.fetch("/reader/get/feed/all")')

  try {
    dialog.showOpenDialog = async (_window, options) => {
      assert.deepEqual(options.filters[0].extensions, ['opml', 'xml'])
      await pickerGate
      return { canceled: false, filePaths: [selectedPath] }
    }
    dialog.showSaveDialog = async (_window, options) => {
      assert.equal(options.defaultPath, 'yikan-subscriptions.opml')
      await pickerGate
      return { canceled: false, filePath: exportPath }
    }
    fs.writeFileSync(importPath, `<opml version="2.0"><body><outline text="Folder">
      <outline text="Keep the local title" xmlUrl="${base}/folder/../empty"/>
      <outline text="News &amp; Updates" xmlUrl="${base}/opml" htmlUrl="${base}/home" description="Testing OPML"/>
      <outline text="Duplicate" xmlUrl="${base}/opml"/>
      <outline text="Unavailable feed" xmlUrl="${base}/invalid"/>
      <outline text="Invalid URL" xmlUrl="file:///tmp/not-a-feed.xml"/>
    </outline></body></opml>`)

    await choose('Import')
    const saved = await feeds()
    assert.deepEqual(saved.map(feed => feed.url), [`${base}/empty`, `${base}/opml`, `${base}/invalid`])
    const [empty, imported, unavailable] = saved
    assert.equal(empty.title, 'Empty feed')
    assert.equal(unavailable.title, 'Unavailable feed')
    assert.equal(imported.title, 'News & Updates')
    assert.equal(imported.link, `${base}/home`)
    assert.equal(imported.description, 'Testing OPML')
    await wait(`document.querySelector('[data-feed-id="${imported.id}"]').textContent.includes('News & Updates')`)
    await wait(`(await window.yikan.fetch('/reader/get/articles', { tab: ${imported.id}, page: 1, size: 50 })).count > 0`)

    await choose('Export')
    const xml = fs.readFileSync(exportPath, 'utf8')
    assert.match(xml, /<title>一刊订阅<\/title>/)
    assert.match(xml, /text="News &amp; Updates"/)
    assert.match(xml, /description="Testing OPML"/)
    assert.doesNotMatch(xml, /Fixture article/)

    selectedPath = exportPath
    await choose('Import')
    assert.deepEqual((await feeds()).map(feed => feed.id), saved.map(feed => feed.id))

    await run(`window.yikan.fetch('/reader/delete/feed', ${imported.id})`)
    await wait(`!document.querySelector('[data-feed-id="${imported.id}"]')`)
    await choose('Export')
    assert.doesNotMatch(fs.readFileSync(exportPath, 'utf8'), /News &amp; Updates/)
    selectedPath = importPath
    await choose('Import')
    const reactivatedOrder = [empty.id, unavailable.id, imported.id]
    assert.deepEqual((await feeds()).map(feed => feed.id), reactivatedOrder)
    await wait(`Array.from(document.querySelectorAll('aside [data-feed-id]'), row => row.dataset.feedId)
      .join(',') === ${JSON.stringify(reactivatedOrder.join(','))}`)

    fs.writeFileSync(importPath, `<opml><body><outline xmlUrl="${base}/must-not-save"/>`)
    await choose('Import')
    assert.equal(await run('document.querySelector("aside [role=alert]")?.textContent.trim()'),
      "The selected file isn't a valid OPML document.")
    assert.equal((await feeds()).length, 3)
    console.log('OPML smoke passed: file pickers, merge, background refresh, active export and resubscription')
  } finally {
    dialog.showOpenDialog = openPicker
    dialog.showSaveDialog = savePicker
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
