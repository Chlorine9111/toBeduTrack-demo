export default function Loading() {
  return (
    <div className="flex h-full flex-1 bg-white">
      <div className="hidden h-full w-[280px] shrink-0 flex-col bg-default-100 md:flex">
        <div className="space-y-2 px-3 pt-4">
          <div className="h-3 w-16 animate-pulse rounded bg-default-200" />
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-[30px] animate-pulse rounded bg-default-100"
              style={{ width: `${72 - index * 10}%` }}
            />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-11 border-b border-divider px-4 py-2">
          <div className="h-6 w-48 animate-pulse rounded bg-default-200" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-divider border-t-foreground" />
        </div>
      </div>
    </div>
  );
}
