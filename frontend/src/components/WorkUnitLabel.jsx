import { Tooltip } from "@idds/react";
import { workUnitFullName, workUnitShortName } from "../lib/workUnits";

export default function WorkUnitLabel({
  name,
  alias,
  parentName,
  parentAlias,
  grandparentName,
  grandparentAlias,
  hierarchy = false,
  fallback = "Unit belum diisi",
  className = "",
}) {
  const sourceName = String(name || "").trim();
  if (!sourceName) return <span className={className}>{fallback}</span>;

  const unitFullName = workUnitFullName(sourceName);
  const unitShortName = String(alias || "").trim() || workUnitShortName(sourceName);
  const sourceParentName = String(parentName || "").trim();
  const parentFullName = workUnitFullName(sourceParentName);
  const parentShortName = String(parentAlias || "").trim() || workUnitShortName(sourceParentName);
  const sourceGrandparentName = String(grandparentName || "").trim();
  const grandparentFullName = workUnitFullName(sourceGrandparentName);
  const grandparentShortName = String(grandparentAlias || "").trim() || workUnitShortName(sourceGrandparentName);
  const showParent = hierarchy && sourceParentName;
  const showGrandparent = hierarchy && sourceGrandparentName;
  const fullName = [showGrandparent ? grandparentFullName : "", showParent ? parentFullName : "", unitFullName].filter(Boolean).join(" — ");
  const shortName = [showGrandparent ? grandparentShortName : "", showParent ? parentShortName : "", unitShortName].filter(Boolean).join(" — ");
  const label = <span className={className} aria-label={fullName}>{shortName}</span>;
  if (shortName === fullName) return label;

  return (
    <Tooltip className="kms-work-unit-tooltip" variant="basic" title={fullName} placement="top" showArrow={true}>
      <span className={className} title={fullName} aria-label={fullName}>{shortName}</span>
    </Tooltip>
  );
}
