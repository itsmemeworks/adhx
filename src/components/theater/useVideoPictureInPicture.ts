'use client'

import { useEffect, type RefObject } from 'react'

export const PIP_STATE = 'theater-pip-state'
export const PIP_QUERY = 'theater-pip-query'
export const PIP_TOGGLE = 'theater-pip-toggle'

export interface PictureInPictureState {
  supported: boolean
  ready: boolean
  active: boolean
  pending: boolean
  error: string | null
}

export const NO_PICTURE_IN_PICTURE: PictureInPictureState = {
  supported: false,
  ready: false,
  active: false,
  pending: false,
  error: null,
}

type SafariVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean
  webkitSetPresentationMode?: (mode: string) => void
  webkitPresentationMode?: string
}

/** The stage owns the media element; chrome sends commands synchronously so
 * browser user activation survives the click, just like the sound controls. */
export function useVideoPictureInPicture(
  videoRef: RefObject<HTMLVideoElement | null>,
  covered: boolean,
) {
  useEffect(() => {
    const video = videoRef.current as SafariVideo | null
    if (!video) return
    let disposed = false
    let pending = false
    let error: string | null = null
    const standard = () =>
      document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function'
    const supported = () =>
      !video.disablePictureInPicture &&
      (standard() ||
        (typeof video.webkitSetPresentationMode === 'function' &&
          video.webkitSupportsPresentationMode?.('picture-in-picture') === true))
    const active = () =>
      document.pictureInPictureElement === video ||
      video.webkitPresentationMode === 'picture-in-picture'
    const ready = () => video.readyState >= 1 && video.videoWidth > 0 && !video.error
    const publish = () => {
      if (disposed) return
      window.dispatchEvent(
        new CustomEvent<PictureInPictureState>(PIP_STATE, {
          detail: covered
            ? NO_PICTURE_IN_PICTURE
            : { supported: !!supported(), ready: ready(), active: active(), pending, error },
        }),
      )
    }
    const exit = async () => {
      // Never close another player's floating window.
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture()
      else if (video.webkitPresentationMode === 'picture-in-picture') {
        video.webkitSetPresentationMode?.('inline')
      }
    }
    const toggle = async () => {
      if (covered || disposed || pending || (!active() && (!supported() || !ready()))) return
      pending = true
      error = null
      publish()
      try {
        if (active()) await exit()
        else if (standard()) await video.requestPictureInPicture()
        else video.webkitSetPresentationMode?.('picture-in-picture')
        // A request can finish after navigation covered or removed this video.
        if (disposed) await exit()
      } catch {
        error = 'Picture-in-picture could not open. Try again.'
      } finally {
        pending = false
        publish()
      }
    }
    const reset = () => {
      error = null
      publish()
    }
    const presentationChanged = () => {
      if (covered && active()) void exit().catch(() => {})
      reset()
    }
    const mediaEvents = ['loadedmetadata', 'emptied', 'error', 'resize']
    const presentationEvents = [
      'enterpictureinpicture',
      'leavepictureinpicture',
      'webkitpresentationmodechanged',
    ]
    mediaEvents.forEach((name) => video.addEventListener(name, reset))
    presentationEvents.forEach((name) => video.addEventListener(name, presentationChanged))
    window.addEventListener(PIP_QUERY, publish)
    window.addEventListener(PIP_TOGGLE, toggle)
    if (covered) void exit().catch(() => {})
    publish()
    return () => {
      disposed = true
      mediaEvents.forEach((name) => video.removeEventListener(name, reset))
      presentationEvents.forEach((name) => video.removeEventListener(name, presentationChanged))
      window.removeEventListener(PIP_QUERY, publish)
      window.removeEventListener(PIP_TOGGLE, toggle)
      void exit().catch(() => {})
      window.dispatchEvent(new CustomEvent(PIP_STATE, { detail: NO_PICTURE_IN_PICTURE }))
    }
    // Keep the PiP session on the same element across consecutive video sources.
  }, [videoRef, covered])
}
