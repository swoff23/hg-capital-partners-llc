-- Connor, Nov 14: tenants don't keep an emergency contact (docs/specs/tenants.md
-- T3, amended). Drops the two columns 20261115130000_tenants_and_leases added;
-- nothing in the app reads them, and no tenant had one when this was written.
ALTER TABLE "Tenant" DROP COLUMN "emergencyName";
ALTER TABLE "Tenant" DROP COLUMN "emergencyPhone";
