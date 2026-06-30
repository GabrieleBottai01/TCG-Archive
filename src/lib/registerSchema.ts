import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional().nullable(),
})
export type RegisterInput = z.infer<typeof registerSchema>
