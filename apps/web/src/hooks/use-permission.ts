import { useCurrentRole } from '@/hooks/use-current-role'
import { permissionChecker } from '@/lib/rbac/policy'

// The current profile's atomic permission check; the API still authorizes every request.
export const usePermission = () => permissionChecker(useCurrentRole().profile)
