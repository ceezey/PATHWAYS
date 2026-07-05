import { LoginForm } from '@/features/auth/login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-9rem)] w-full items-center justify-center rounded-lg bg-[linear-gradient(115deg,#50b7f1_0%,#f7f4ee_48%,#63c3f5_100%)] px-4 py-10 shadow-inner">
      <LoginForm />
    </div>
  )
}
