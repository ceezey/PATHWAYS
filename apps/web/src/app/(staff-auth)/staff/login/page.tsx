import { LoginForm } from '@/features/auth/login-form'
import { StaffAuthShell } from '@/features/auth/staff-auth-shell'

export default function StaffLoginPage() {
  return (
    <StaffAuthShell>
      {/* TODO(DEPLOYMENT): Move the staff portal to the organization-approved secure staff domain or deployment instance. */}
      <LoginForm />
    </StaffAuthShell>
  )
}
