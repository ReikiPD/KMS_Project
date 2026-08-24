import { Button } from "@idds/react";
import { FolderOpen } from "lucide-react";

export default function EmptyState({ icon: Icon = FolderOpen, title, description, actionLabel, onAction, className = "" }) {
  return (
    <div className={`kms-empty-state ${className}`.trim()}>
      <span className="kms-empty-state-icon" aria-hidden="true"><Icon size={28} /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && onAction && <Button hierarchy="secondary" size="sm" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
