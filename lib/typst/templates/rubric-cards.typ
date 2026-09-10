#import "/base.typ": setup-document, accent-color, accent-soft, neutral-muted

#let render-rubric(
  title: "",
  course_name: "",
  unit_name: "",
  subtitle: "",
  paper: "a4",
) = {
  setup-document(title: title, paper: paper, theme: "friendly")
  block(
    width: 100%,
    inset: 16pt,
    radius: 14pt,
    fill: accent-soft("friendly"),
    stroke: accent-color("friendly"),
  )[
    #box(inset: (x: 8pt, y: 2pt), radius: 999pt, fill: white)[
      #text(size: 8pt, weight: "bold", fill: accent-color("friendly"))[Rubric]
    ]
    #v(8pt)
    #text(size: 18pt, weight: "bold", fill: accent-color("friendly"))[#title]
    #v(6pt)
    #text(size: 10pt, fill: neutral-muted())[
      #if subtitle != "" [#subtitle]
      #if course_name != "" [
        #if subtitle != "" [ #linebreak() ]
        #course_name
      ]
      #if unit_name != "" [
        #linebreak()
        #unit_name
      ]
    ]
  ]
  #v(12pt)
}

