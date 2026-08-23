import { DEFAULT_APP_ORIGIN, firstSupportedShareUrl, shareTargetUrl } from './share-url'

const MENU_ID = 'save-to-adhx'
const BADGE_MS = 2_000

function appOrigin(): string {
  const fromEnv = import.meta.env.EXTENSION_PUBLIC_APP_ORIGIN
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '')
  }
  return DEFAULT_APP_ORIGIN
}

function destFor(sourceUrl: string): string {
  return shareTargetUrl(sourceUrl, appOrigin())
}

function openShare(sourceUrl: string, tab?: chrome.tabs.Tab): void {
  const dest = destFor(sourceUrl)
  if (tab?.id != null) {
    void chrome.tabs.update(tab.id, { url: dest })
    return
  }
  void chrome.tabs.create({ url: dest })
}

function flashUnsupported(tab?: chrome.tabs.Tab): void {
  if (tab?.id == null) return
  const tabId = tab.id
  void chrome.action.setBadgeBackgroundColor({ tabId, color: '#c45c4a' })
  void chrome.action.setBadgeText({ tabId, text: '×' })
  setTimeout(() => {
    void chrome.action.setBadgeText({ tabId, text: '' })
  }, BADGE_MS)
}

function saveFrom(tab?: chrome.tabs.Tab, extra?: (string | null | undefined)[]): void {
  const source = firstSupportedShareUrl(...(extra ?? []), tab?.url)
  if (source) {
    openShare(source, tab)
    return
  }
  flashUnsupported(tab)
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Save to ADHX',
      contexts: ['page', 'link', 'selection', 'video'],
    })
  })
})

chrome.action.onClicked.addListener((tab) => {
  saveFrom(tab)
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return
  saveFrom(tab, [info.linkUrl, info.srcUrl, info.selectionText])
})
