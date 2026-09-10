#import "/base.typ": setup-document, accent-color, accent-soft, neutral-muted

#let render-lesson-plan(
  title: "",
  course_name: "",
  unit_name: "",
  meta_line: "",
  paper: "a4",
  mode: "teacher",
) = {
  setup-document(title: title, paper: paper, theme: "academic")
  block(
    width: 100%,
    inset: 18pt,
    radius: 12pt,
    fill: accent-soft("academic"),
    stroke: accent-color("academic"),
  )[
    #text(size: 18pt, weight: "bold", fill: accent-color("academic"))[#title]
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
  #v(12pt)
}
