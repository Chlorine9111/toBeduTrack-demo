#let accent-color(theme) = if theme == "friendly" {
  rgb("#15803d")
} else {
  rgb("#1d4ed8")
}

#let accent-soft(theme) = if theme == "friendly" {
  rgb("#ecfdf5")
} else {
  rgb("#eff6ff")
}

#let neutral-border() = rgb("#d1d5db")
#let neutral-muted() = rgb("#6b7280")
#let neutral-soft() = rgb("#f8fafc")

#let setup-document(title: "", paper: "a4", theme: "academic") = {
  set page(
    paper: paper,
    margin: (x: 2cm, y: 2.2cm),
  )
  set text(
    font: ("New Computer Modern", "Songti SC", "PingFang SC", "Noto Serif CJK SC"),
    size: 10.5pt,
    fill: rgb("#111827"),
  )
  set par(leading: 0.8em)
}
