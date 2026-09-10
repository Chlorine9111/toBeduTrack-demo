#import "/base.typ": setup-document, accent-color, accent-soft, neutral-muted

#let render-rubric(
  title: "",
  course_name: "",
  unit_name: "",
  subtitle: "",
  paper: "a4",
) = {
  setup-document(title: title, paper: paper, theme: "academic")
  block(
    width: 100%,
    inset: 16pt,
    radius: 12pt,
    fill: accent-soft("academic"),
    stroke: accent-color("academic"),
  )[
    #text(size: 18pt, weight: "bold", fill: accent-color("academic"))[#title]
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

