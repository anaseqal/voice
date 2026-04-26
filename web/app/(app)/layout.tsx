import { requireSession } from "@/lib/auth";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
