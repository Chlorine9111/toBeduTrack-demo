#import "/base.typ": neutral-border, neutral-soft, neutral-muted

#let answer-key-item(number: "", answer: "-", body) = block(
  width: 100%,
  inset: 10pt,
  radius: 7pt,
  fill: neutral-soft(),
  stroke: neutral-border(),
)[
  #text(weight: "bold")[#number #answer]
  #v(6pt)
  #text(size: 9pt, fill: neutral-muted())[解析]
  #v(4pt)
  #body
]
