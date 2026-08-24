import { Tooltip } from "@idds/react";
import { workUnitFullName, workUnitShortName } from "../lib/workUnits";

export default function WorkUnitLabel({ name, fallback = "Unit belum diisi", className = "" }) {
  const sourceName = String(name || "").trim();
  if (!sourceName) return <span className={className}>{fallback}</span>;

  const fullName = workUnitFullName(sourceName);
  const shortName = workUnitShortName(sourceName);
  const label = <span className={className} aria-label={fullName}>{shortName}</span>;
  if (shortName === fullName) return label;

  return (
    <Tooltip className="kms-work-unit-tooltip" variant="basic" title={fullName} placement="top" showArrow={true}>
      <span className={className} title={fullName} aria-label={fullName}>{shortName}</span>
    </Tooltip>
  );
}
