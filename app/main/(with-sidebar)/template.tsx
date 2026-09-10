"use client";

export default function RouteTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-route-enter h-full">
      {children}
    </div>
  );
}
