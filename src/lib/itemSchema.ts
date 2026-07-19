import { z } from 'zod'

export const itemInputSchema = z.object({
  game: z.enum(['POKEMON', 'MAGIC', 'YUGIOH', 'ONEPIECE', 'OTHER']),
  itemType: z.enum(['RAW', 'GRADED', 'SEALED']),
  name: z.string().min(1),
  setName: z.string().optional().nullable(),
  cardNumber: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
  priceQuery: z.string().optional().nullable(),
  cardtraderBlueprintId: z.number().int().optional().nullable(),
  autoPriceSource: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  condition: z.enum(['POOR', 'PLAYED', 'LIGHT_PLAYED', 'GOOD', 'EXCELLENT', 'NEAR_MINT', 'MINT']).optional().nullable(),
  gradingCompany: z.enum(['PSA', 'BGS', 'CGC']).optional().nullable(),
  grade: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
  purchasePrice: z.number().min(0),
  marketValue: z.number().min(0),
  marketValueSource: z.enum(['AUTO', 'MANUAL']).default('MANUAL'),
  notes: z.string().optional().nullable(),
})

export type ItemInput = z.infer<typeof itemInputSchema>
