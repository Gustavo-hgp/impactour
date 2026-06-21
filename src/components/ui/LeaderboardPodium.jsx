import * as React from 'react'
import { Crown } from 'lucide-react'
import { cn } from '../../lib/utils.js'

// Adaptado de leaderboard-podium.tsx (shadcn/TSX) para JSX, sem cva,
// usando cores ouro/prata/bronze concretas no lugar das CSS vars --rank-*.
const GAP = { sm: 'gap-2', default: 'gap-4', lg: 'gap-6' }

const PODIUM_CONFIG = {
  1: { color: 'text-amber-500', bg: 'bg-amber-400/30', height: 'h-32', heightSm: 'h-24', heightLg: 'h-40' },
  2: { color: 'text-slate-400', bg: 'bg-slate-300/50', height: 'h-24', heightSm: 'h-20', heightLg: 'h-32' },
  3: { color: 'text-orange-600', bg: 'bg-orange-300/40', height: 'h-20', heightSm: 'h-16', heightLg: 'h-28' },
}

export const LeaderboardPodium = React.forwardRef(function LeaderboardPodium(
  {
    className,
    size = 'default',
    rankings,
    showValue = true,
    showAvatar = true,
    medalStyle = 'classic',
    formatValue = (v) => v.toLocaleString('pt-BR'),
    ...props
  },
  ref,
) {
  const top3 = rankings.slice(0, 3)
  const podiumOrder = [
    top3.find((r) => r.rank === 2),
    top3.find((r) => r.rank === 1),
    top3.find((r) => r.rank === 3),
  ].filter(Boolean)

  if (podiumOrder.length === 0) return null

  const avatarSize = { sm: 'h-10 w-10 text-sm', default: 'h-14 w-14 text-lg', lg: 'h-20 w-20 text-2xl' }[size]
  const iconSize = { sm: 'h-4 w-4', default: 'h-5 w-5', lg: 'h-6 w-6' }[size]
  const textSize = { sm: 'text-xs', default: 'text-sm', lg: 'text-base' }[size]

  return (
    <div
      ref={ref}
      className={cn('flex items-end justify-center', GAP[size], className)}
      role="list"
      aria-label="Top 3"
      {...props}
    >
      {podiumOrder.map((ranking) => {
        const config = PODIUM_CONFIG[ranking.rank]
        if (!config) return null

        const displayName = ranking.userName || `#${ranking.userId}`
        const podiumHeight = { sm: config.heightSm, default: config.height, lg: config.heightLg }[size]

        return (
          <div key={ranking.userId} role="listitem" className="flex flex-col items-center">
            <div className="relative mb-2" aria-hidden="true">
              {showAvatar && ranking.avatarUrl ? (
                <img src={ranking.avatarUrl} alt="" className={cn('rounded-full object-cover', avatarSize)} />
              ) : (
                <div className={cn('flex items-center justify-center rounded-full', avatarSize, config.bg)}>
                  <Crown className={cn(iconSize, config.color)} />
                </div>
              )}

              {medalStyle !== 'minimal' && (
                <div
                  className={cn(
                    'absolute -right-1 -bottom-1 flex items-center justify-center rounded-full bg-white shadow-sm',
                    size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6',
                  )}
                >
                  <Crown
                    className={cn(
                      config.color,
                      size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4',
                    )}
                  />
                </div>
              )}
            </div>

            <span className={cn('max-w-24 truncate text-center font-medium', textSize)} title={displayName}>
              {displayName}
            </span>

            {showValue && (
              <span className={cn('text-slate-500 tabular-nums', size === 'sm' ? 'text-xs' : 'text-sm')}>
                {formatValue(ranking.value)}
              </span>
            )}

            <div
              aria-hidden="true"
              className={cn('mt-2 w-24 rounded-t-lg', size === 'sm' && 'w-20', podiumHeight, config.bg)}
            >
              <div className={cn('flex h-8 items-center justify-center font-bold', config.color)}>
                {ranking.rank}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})
