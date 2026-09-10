#import "/base.typ": setup-document, accent-color, accent-soft, neutral-muted
#import "/components/student-info.typ": student-info

#let render-exam(
  title: "",
  course_name: "",
  subtitle: "",
  paper: "us-letter",
  date: "",
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
      #if course_name != "" [#course_name]
      #if subtitle != "" [
        #if course_name != "" [ #linebreak() ]
        #subtitle
      ]
    ]
  ]
  #v(10pt)
  #student-info(date: date)
  #v(12pt)
}

