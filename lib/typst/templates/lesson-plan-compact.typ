#import "/base.typ": setup-document, accent-color, accent-soft, neutral-muted

#let render-lesson-plan(
  title: "",
  course_name: "",
  unit_name: "",
  meta_line: "",
  paper: "a4",
  mode: "teacher",
) = {
  setup-document(title: title, paper: paper, theme: "friendly")
  block(
    width: 100%,
    inset: 14pt,
    radius: 14pt,
    fill: accent-soft("friendly"),
    stroke: accent-color("friendly"),
  )[
    #box(inset: (x: 8pt, y: 2pt), radius: 999pt, fill: white)[
      #text(size: 8pt, weight: "bold", fill: accent-color("friendly"))[Lesson]
    ]
    #v(8pt)
    #text(size: 18pt, weight: "bold", fill: accent-color("friendly"))[#title]
    #v(6pt)
    #text(size: 10pt, fill: neutral-muted())[
      #if course_name != "" [#course_name]
      #if unit_name != "" [
        #if course_name != "" [ #linebreak() ]
        #unit_name
      ]
      #if meta_line != "" [
        #linebreak()
        #meta_line
      ]
    ]
  ]
  #v(10pt)
}
