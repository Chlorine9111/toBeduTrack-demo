import { Card, Skeleton } from "@heroui/react"

function QuestionCardSkeleton() {
  return (
    <Card className="h-[360px] overflow-hidden border-[0.5px] border-[rgba(0,0,0,0.08)] p-5" variant="default">
      <Card.Header className="flex-row flex-wrap gap-2 p-0">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </Card.Header>
      <Card.Content className="flex-1 p-0 pt-4">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="mt-2 h-4 w-5/6 rounded" />
        <Skeleton className="mt-2 h-4 w-4/6 rounded" />
        <div className="mt-6 space-y-3">
          {["A", "B", "C", "D"].map((label) => (
            <div key={label} className="flex items-center gap-3">
              <Skeleton className="h-4 w-6 rounded" />
              <Skeleton className="h-4 flex-1 rounded" />
            </div>
          ))}
        </div>
      </Card.Content>
      <Card.Footer className="flex-wrap gap-2 p-0 pt-4">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </Card.Footer>
    </Card>
  )
}

export default function QuestionGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-qb-card-enter"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <QuestionCardSkeleton />
        </div>
      ))}
    </div>
  )
}
