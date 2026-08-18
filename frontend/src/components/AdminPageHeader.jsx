import { Breadcrumb } from "@idds/react";
import { ChevronRight } from "lucide-react";

export default function AdminPageHeader({ eyebrow, title, description, breadcrumbs, actions, compact = false }) {
  return (
    <header className={compact ? "mb-5" : "mb-7"}>
      {breadcrumbs?.length > 0 && <Breadcrumb items={breadcrumbs} separator={<ChevronRight size={16} />} className={compact ? "mb-3" : "mb-5"} />}
      <div className={`kms-admin-page-heading flex flex-wrap items-end justify-between gap-4 border-b ${compact ? "pb-4" : "pb-6"}`}>
        <div>
          {eyebrow && <p className="kms-admin-section-eyebrow">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-content-primary md:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
    </header>
  );
}
