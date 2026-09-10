"use client"

/**
 * High-density SVG noise texture for paper-fiber simulation.
 * Applied as background-image with mix-blend-mode: multiply for realism.
 */
export const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E")`

/**
 * Deskmate brand mark — right triangle (half square).
 * Right angle at bottom-left, hypotenuse from bottom-left to top-right.
 * Looks like: ◣ (bottom-left to top-right diagonal slash of a square)
 */
export function DeskmateLogo({
  size = 16,
  color = "currentColor",
  opacity = 1,
  className = "",
}: {
  size?: number
  color?: string
  opacity?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ opacity }}
    >
      <path
        d="M22 22L22 2L2 22H22Z"
        fill={color}
      />
    </svg>
  )
}
