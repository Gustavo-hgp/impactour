import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Junta classes Tailwind resolvendo conflitos (padrão shadcn).
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
