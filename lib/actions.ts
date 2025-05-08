"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { clearSession, createSession, getSession, hashPassword, verifyPassword } from "@/lib/auth"

// Auth actions
export async function registerUser({ name, phone, password }: { name: string; phone: string; password: string }) {
  try {
    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { phone },
    })

    if (existingUser) {
      return { success: false, error: "Este número de telefone já está registrado." }
    }

    const hashedPassword = await hashPassword(password)

    // Create user
    await db.user.create({
      data: {
        name,
        phone,
        password: hashedPassword,
        wallet: {
          create: {
            balance: 0,
            withdrawalBalance: 0,
          },
        },
      },
    })

    return { success: true }
  } catch (error) {
    console.error("Error registering user:", error)
    return { success: false, error: "Ocorreu um erro ao registrar o usuário." }
  }
}

export async function loginUser({ phone, password }: { phone: string; password: string }) {
  try {
    const user = await db.user.findUnique({
      where: { phone },
    })

    if (!user) {
      return { success: false, error: "Usuário não encontrado." }
    }

    const passwordValid = await verifyPassword(password, user.password)

    if (!passwordValid) {
      return { success: false, error: "Senha incorreta." }
    }

    // Create session
    await createSession(user)

    return { success: true }
  } catch (error) {
    console.error("Error logging in:", error)
    return { success: false, error: "Ocorreu um erro ao fazer login." }
  }
}

export async function logoutUser() {
  await clearSession()
  redirect("/")
}

// Wallet actions
export async function getUserWallet() {
  const session = await getSession()

  if (!session) {
    throw new Error("Usuário não autenticado")
  }

  const wallet = await db.wallet.findUnique({
    where: { userId: session.id },
  })

  if (!wallet) {
    throw new Error("Carteira não encontrada")
  }

  return {
    id: session.phone,
    balance: wallet.balance,
    withdrawalBalance: wallet.withdrawalBalance,
  }
}

// Investment actions
export async function purchasePackage(packageId: string) {
  const session = await getSession()

  if (!session) {
    return { success: false, error: "Usuário não autenticado" }
  }

  try {
    // Get package details
    const packageDetails = getPackageDetails(packageId)

    if (!packageDetails) {
      return { success: false, error: "Pacote não encontrado" }
    }

    // Check if user has enough balance
    const wallet = await db.wallet.findUnique({
      where: { userId: session.id },
    })

    if (!wallet || wallet.balance < packageDetails.price) {
      return { success: false, insufficientFunds: true, error: "Saldo insuficiente" }
    }

    // Check if user has reached the limit of 10 active investments
    const activeInvestments = await db.investment.count({
      where: {
        userId: session.id,
        status: "ACTIVE",
      },
    })

    if (activeInvestments >= 10) {
      return { success: false, error: "Você atingiu o limite de 10 investimentos ativos" }
    }

    // Create investment and update wallet
    await db.$transaction([
      db.investment.create({
        data: {
          userId: session.id,
          packageId,
          amount: packageDetails.price,
          dailyReturn: packageDetails.dailyReturn,
          duration: packageDetails.duration,
          status: "ACTIVE",
          endDate: new Date(Date.now() + packageDetails.duration * 24 * 60 * 60 * 1000),
        },
      }),
      db.wallet.update({
        where: { userId: session.id },
        data: {
          balance: { decrement: packageDetails.price },
        },
      }),
    ])

    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    console.error("Error purchasing package:", error)
    return { success: false, error: "Ocorreu um erro ao adquirir o pacote" }
  }
}

function getPackageDetails(packageId: string) {
  const packages = {
    "vip-1": { price: 10000, dailyReturn: 1000, duration: 31 },
    "vip-2": { price: 30000, dailyReturn: 3000, duration: 31 },
    "vip-3": { price: 55000, dailyReturn: 5500, duration: 60 },
    "vip-4": { price: 75000, dailyReturn: 8000, duration: 60 },
    "vip-5": { price: 150000, dailyReturn: 45000, duration: 7 },
    "vip-6": { price: 365000, dailyReturn: 120000, duration: 7 },
  }

  return packages[packageId as keyof typeof packages]
}

// Withdrawal actions
export async function requestWithdrawal({ iban, amount }: { iban: string; amount: number }) {
  const session = await getSession()

  if (!session) {
    return { success: false, error: "Usuário não autenticado" }
  }

  try {
    // Check if user has enough withdrawal balance
    const wallet = await db.wallet.findUnique({
      where: { userId: session.id },
    })

    if (!wallet || wallet.withdrawalBalance < amount) {
      return { success: false, insufficientFunds: true, error: "Saldo de retirada insuficiente" }
    }

    // Create withdrawal request and update wallet
    await db.$transaction([
      db.withdrawalRequest.create({
        data: {
          userId: session.id,
          amount,
          iban,
          status: "PENDING",
        },
      }),
      db.wallet.update({
        where: { userId: session.id },
        data: {
          withdrawalBalance: { decrement: amount },
        },
      }),
    ])

    revalidatePath("/dashboard/withdrawal-history")
    return { success: true }
  } catch (error) {
    console.error("Error requesting withdrawal:", error)
    return { success: false, error: "Ocorreu um erro ao solicitar a retirada" }
  }
}

export async function getUserWithdrawals() {
  const session = await getSession()

  if (!session) {
    throw new Error("Usuário não autenticado")
  }

  const withdrawals = await db.withdrawalRequest.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
  })

  return withdrawals
}

// Admin actions
export async function getWithdrawalRequests() {
  const session = await getSession()

  if (!session || session.role !== "ADMIN") {
    throw new Error("Acesso não autorizado")
  }

  const requests = await db.withdrawalRequest.findMany({
    orderBy: [
      { status: "asc" }, // PENDING first
      { createdAt: "desc" },
    ],
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
  })

  return requests.map((req) => ({
    ...req,
    userName: req.user.name,
  }))
}

export async function approveWithdrawal(id: string) {
  const session = await getSession()

  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado" }
  }

  try {
    await db.withdrawalRequest.update({
      where: { id },
      data: { status: "APPROVED" },
    })

    revalidatePath("/admin")
    return { success: true }
  } catch (error) {
    console.error("Error approving withdrawal:", error)
    return { success: false, error: "Ocorreu um erro ao aprovar a retirada" }
  }
}

export async function rejectWithdrawal(id: string) {
  const session = await getSession()

  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "Acesso não autorizado" }
  }

  try {
    // Get the withdrawal request
    const withdrawal = await db.withdrawalRequest.findUnique({
      where: { id },
      select: { userId: true, amount: true },
    })

    if (!withdrawal) {
      return { success: false, error: "Solicitação não encontrada" }
    }

    // Update withdrawal status and return funds to user's wallet
    await db.$transaction([
      db.withdrawalRequest.update({
        where: { id },
        data: { status: "REJECTED" },
      }),
      db.wallet.update({
        where: { userId: withdrawal.userId },
        data: {
          withdrawalBalance: { increment: withdrawal.amount },
        },
      }),
    ])

    revalidatePath("/admin")
    return { success: true }
  } catch (error) {
    console.error("Error rejecting withdrawal:", error)
    return { success: false, error: "Ocorreu um erro ao recusar a retirada" }
  }
}
