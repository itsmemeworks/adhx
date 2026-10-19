import { faceColour, faceInitial } from './faces'

/**
 * A member's initial on their colour, filling its frame (put it inside
 * `GobShape`), drawn the way `NxAvatar` draws it: black, weight 800, the
 * letter a pseudo-element so it never joins the text around it.
 */
export function FaceInitial({
  username,
  name,
  size,
}: {
  username: string
  name?: string | null
  /** The frame's size in pixels, for the letter's size. */
  size: number
}) {
  return (
    <span
      aria-hidden
      data-face="initial"
      data-initial={faceInitial(name, username)}
      className="flex h-full w-full items-center justify-center font-nx-sans font-extrabold leading-none text-black before:content-[attr(data-initial)]"
      style={{ background: faceColour(username), fontSize: Math.max(8, Math.round(size * 0.42)) }}
    />
  )
}
