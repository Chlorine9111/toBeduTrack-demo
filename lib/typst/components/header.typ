#import "/base.typ": neutral-muted
#import "/components/student-info.typ": student-info

#let worksheet-header(
  title,
  course_name: "",
  teacher_name: "",
  date: "",
  subtitle: "Worksheet",
  theme: "academic",
) = [
  #align(center)[
    #text(size: 18pt, weight: "bold")[#title]
    #v(4pt)
    #text(size: 10pt, fill: rgb("#555555"))[
      #if course_name != "" [#course_name]
      #if teacher_name != "" [
        #if course_name != "" [ #sym.space.quad ]
        #teacher_name
      ]
    ]
  ]
  #v(6pt)
  #line(length: 100%, stroke: 1pt + rgb("#333333"))
  #v(8pt)
  #student-info(date: date)
]
