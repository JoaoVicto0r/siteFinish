"use client"

import Link from "next/link"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { logoutUser } from "@/lib/actions"

export function AdminHeader() {
  return (
    <header className="bg-gray-900 text-white shadow">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/admin" className="flex items-center">
              <Logo className="h-8 w-8 mr-2 text-white" />
              <span className="text-xl font-bold">Totalenergies Admin</span>
            </Link>
          </div>

          <form action={logoutUser}>
            <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-gray-800">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
