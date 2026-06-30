import { it, expect } from 'vitest'
import { registerSchema } from '@/lib/registerSchema'

it('accepts a valid registration', () => {
  expect(registerSchema.safeParse({ email: 'a@b.com', password: 'longenough', name: 'Gabriele' }).success).toBe(true)
})
it('rejects bad email and short password', () => {
  expect(registerSchema.safeParse({ email: 'nope', password: 'longenough' }).success).toBe(false)
  expect(registerSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false)
})
