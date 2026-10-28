import { ActionDropdown } from "@idds/react";
export default function ActionMenu({ items }) {
  return <ActionDropdown label="Lainnya" size="sm" variant="ghost" placement="bottom-end" items={items} />;
}
