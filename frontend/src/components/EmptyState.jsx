import { Button } from "@idds/react";
import { FolderOpen } from "lucide-react";
import PublicVisual from "./PublicVisual";

export default function EmptyState({ icon: Icon = FolderOpen, illustration, title, description, actionLabel, onAction, actionIcon, actionSize = "sm", className = "" }) {
  return (
    <div className={`kms-empty-state ${className}`.trim()}>
      {illustration ? <PublicVisual kind={illustration} className="kms-empty-illustration" /> : <span className="kms-empty-state-icon" aria-hidden="true"><Icon size={28} /></span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && onAction && <Button hierarchy="secondary" size={actionSize} prefixIcon={actionIcon} onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
