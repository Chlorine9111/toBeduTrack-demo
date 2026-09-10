#import "/base.typ": accent-color, accent-soft, neutral-muted

#let section-banner(title, subtitle: "", theme: "academic") = block(
  width: 100%,
  inset: 10pt,
  radius: 9pt,
  fill: accent-soft(theme),
  stroke: accent-color(theme),
)[
  #text(size: 12pt, weight: "bold", fill: accent-color(theme))[#title]
  #if subtitle != "" [
    #v(4pt)
    #text(size: 9pt, fill: neutral-muted())[#subtitle]
  ]
]
