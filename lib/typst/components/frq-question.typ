// FRQ 题目组件
// answer_height: 接受 "1fr"（自适应剩余空间）或具体高度如 "4.4cm"
#import "/base.typ": neutral-border, neutral-soft

#let frq-question(number: "", points: none, answer_height: "1fr", breakable: false, body) = block(
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
      fill: neutral-soft(),
    )[#points]
  ]
  #v(8pt)
  #body
  #v(10pt)
  #if answer_height == "1fr" [
    #v(1fr)
  ] else [
    #block(
      width: 100%,
      height: eval(answer_height),
      inset: 6pt,
      radius: 6pt,
      fill: neutral-soft(),
      stroke: neutral-border(),
    )[]
  ]
]
