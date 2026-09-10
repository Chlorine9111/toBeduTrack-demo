#import "/base.typ": setup-document
#import "/components/header.typ": worksheet-header

#let render-worksheet(
  title: "",
  course_name: "",
  teacher_name: "",
  date: "",
  paper: "us-letter",
) = {
  setup-document(title: title, paper: paper, theme: "friendly")
  worksheet-header(
    title,
    course_name: course_name,
    teacher_name: teacher_name,
    date: date,
    subtitle: "Friendly Worksheet",
    theme: "friendly",
  )
  v(12pt)
}
