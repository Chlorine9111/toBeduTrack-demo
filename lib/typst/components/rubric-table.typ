#import "/base.typ": neutral-border, neutral-soft

#let rubric-row(label: "", points: "", body) = table(
  columns: (auto, auto, 1fr),
  stroke: none,
  column-gutter: 12pt,
  [#text(weight: "bold")[#label]],
  [#points],
  [#body],
)

#let rubric-table(title: "", body) = block(
  width: 100%,
  inset: 12pt,
  radius: 8pt,
  fill: neutral-soft(),
  stroke: neutral-border(),
)[
  #text(weight: "bold")[#title]
  #v(8pt)
  #body
]
