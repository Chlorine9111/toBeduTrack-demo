import ProductShell from "@/components/shells/ProductShell";

export default function PblLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductShell>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </ProductShell>
  );
}
