import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminHeader } from "@/components/admin-header"
import { AdminWithdrawalRequests } from "@/components/admin-withdrawal-requests"

export default async function AdminPage() {
  const session = await getSession()

  if (!session || session.role !== "ADMIN") {
    redirect("/")
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AdminHeader />
      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Painel de Administração</h1>
        <AdminWithdrawalRequests />
      </main>
    </div>
  )
}
