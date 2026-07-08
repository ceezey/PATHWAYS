import { LoginForm } from '@/features/auth/login-form'

export default function StaffLoginPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(115deg,#50b7f1_0%,#f7f4ee_48%,#63c3f5_100%)] px-4 py-10">
      {/* TODO(DEPLOYMENT): Move the staff portal to the organization-approved secure staff domain or deployment instance. */}
      <LoginForm />
    </main>
  )
}
