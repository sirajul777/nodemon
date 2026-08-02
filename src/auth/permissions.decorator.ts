import { SetMetadata } from '@nestjs/common';

export type PermissionKey =
  | 'viewDashboard'
  | 'manageVoucher'
  | 'manageBilling'
  | 'manageReseller'
  | 'managePppoe'
  | 'manageHotspot'
  | 'viewReport'
  | 'manageSystem';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Declare the permission(s) required to access a controller/route.
 * The guard allows access if the user has ANY of the listed permissions
 * (admin always passes).
 */
export const RequirePermission = (...perms: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

