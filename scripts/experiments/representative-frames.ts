/** Experiment only: preserve temporal anchors while discarding visually redundant samples. */
export function representativeFrames(
  signatures: readonly Uint8Array[],
  maxGap = 3,
  difference = 3,
): number[] {
  if (!Number.isInteger(maxGap) || maxGap < 1 || !Number.isFinite(difference) || difference < 0)
    throw new Error('Invalid frame selection bounds')
  if (!signatures.length) return []
  const size = signatures[0].length
  if (!size || signatures.some((value) => value.length !== size))
    throw new Error('Invalid signatures')
  const selected = [0]
  for (let i = 1; i < signatures.length; i++) {
    const previous = selected.at(-1)!
    const distance =
      signatures[i].reduce((sum, value, j) => sum + Math.abs(value - signatures[previous][j]), 0) /
      size
    if (i === signatures.length - 1 || i - previous >= maxGap || distance >= difference)
      selected.push(i)
  }
  return selected
}
