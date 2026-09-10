// MC 选择题组件
// columns: 1 为单列排列，2 为两列排列
#import "/base.typ": accent-soft, neutral-border, neutral-soft

#let mc-option(label: "", body) = block(
  width: 100%,
  inset: 8pt,
  radius: 6pt,
  fill: neutral-soft(),
  stroke: neutral-border(),
)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    column-gutter: 10pt,
    [
      #box(
        inset: (x: 6pt, y: 2pt),
        radius: 999pt,
        fill: accent-soft("academic"),
      )[
        #text(weight: "bold")[#label]
      ]
    ],
    [#body],
  )
]

#let mc-options-grid(columns: 1, ..options) = {
  let items = options.pos()
  if columns == 2 and items.len() > 0 {
    grid(
      columns: (1fr, 1fr),
      column-gutter: 8pt,
      row-gutter: 6pt,
      ..items
    )
  } else {
    for (i, item) in items.enumerate() {
      item
      if i < items.len() - 1 {
        v(6pt)
      }
    }
  }
}

#let mc-question(number: "", points: none, breakable: false, columns: 1, body, options) = block(
  width: 100%,
  breakable: breakable,
  inset: 12pt,
  radius: 8pt,
  stroke: neutral-border(),
)[
  #text(weight: "bold")[#number]
  #if points != none [
    #h(8pt)
    #box(
      inset: (x: 6pt, y: 2pt),
      radius: 999pt,
      fill: accent-soft("academic"),
    )[#points]
  ]
  #v(8pt)
  #body
  #v(10pt)
  #options
]
