import { Building2 } from "lucide-react";
import { uploadUrl } from "../lib/api";
import { workUnitVisualKind } from "../lib/workUnits";
import { usePublicImageSources } from "../hooks/usePublicVisual";
import roadLogo from "../assets/work-units/ditjen-hubdat.png?url&no-inline";
import seaLogo from "../assets/work-units/ditjen-hubla.png?url&no-inline";
import airLogo from "../assets/work-units/ditjen-hubud.png?url&no-inline";
import railLogo from "../assets/work-units/djka.png?url&no-inline";
import policyLogo from "../assets/work-units/bkt.png?url&no-inline";
import intramLogo from "../assets/work-units/intram.png?url&no-inline";
import educationLogo from "../assets/work-units/bpsdm.png?url&no-inline";
import secretariatLogo from "../assets/work-units/setjen.png?url&no-inline";
import inspectorateLogo from "../assets/work-units/itjen.png?url&no-inline";

const PROVIDED_LOGOS = {
  road: roadLogo,
  sea: seaLogo,
  air: airLogo,
  rail: railLogo,
  policy: policyLogo,
  multimodal: intramLogo,
  education: educationLogo,
  secretariat: secretariatLogo,
  inspectorate: inspectorateLogo,
};

// Uploaded unit logos take precedence; local marks need no external image host.
// This is decorative because the unit's name is always rendered alongside it.
export default function WorkUnitLogo({ unit, className = "" }) {
  const kind = workUnitVisualKind(unit);
  const { src, onError } = usePublicImageSources([uploadUrl(unit?.logo_url), PROVIDED_LOGOS[kind]]);
  return <span className={`kms-work-unit-logo ${src ? "has-image" : ""} ${className}`.trim()} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={onError} /> : <Building2 size={24} />}
  </span>;
}
