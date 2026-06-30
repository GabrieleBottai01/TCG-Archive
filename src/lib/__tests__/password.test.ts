import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('password', () => {
  it('hashes to something different from the plaintext and verifies', async () => {
    const hash = await hashPassword('s3cret-pass')
    expect(hash).not.toBe('s3cret-pass')
    expect(hash.length).toBeGreaterThan(20)
    expect(await verifyPassword('s3cret-pass', hash)).toBe(true)
  })
  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})
