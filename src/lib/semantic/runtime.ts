/** Opt-in allocation policy; changing this does not change model inputs or vectors. */
export function semanticMemoryOptions(): {
  enableCpuMemArena?: boolean
  enableMemPattern?: boolean
} {
  const profile = process.env['SEMANTIC_MEMORY_PROFILE'] || 'standard'
  if (profile === 'standard') return {}
  if (profile === 'compact') return { enableCpuMemArena: false, enableMemPattern: false }
  throw new Error('SEMANTIC_MEMORY_PROFILE must be standard or compact')
}
