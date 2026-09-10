#import "/base.typ": setup-document, accent-color, accent-soft, neutral-muted
#import "/components/student-info.typ": student-info

#let render-exam(
  title: "",
  course_name: "",
  subtitle: "",
  paper: "us-letter",
  date: "",
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
      #text(size: 8pt, weight: "bold", fill: accent-color("friendly"))[Assessment]
    ]
    #v(8pt)
    #text(size: 18pt, weight: "bold", fill: accent-color("friendly"))[#title]
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

