#let student-info(date: "") = {
  table(
    columns: (1fr, 1fr),
    stroke: none,
    inset: (x: 0pt, y: 4pt),
    [Name: #box(width: 120pt, line(length: 100%))],
    [Date: #if date != "" [#date] else [#box(width: 120pt, line(length: 100%))]],
    [Class: #box(width: 120pt, line(length: 100%))],
    [Score: #box(width: 60pt, line(length: 100%)) / #box(width: 60pt, line(length: 100%))],
  )
}
