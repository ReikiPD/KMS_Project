import { useContext } from "react";
import { AdminViewContext } from "../contexts/AdminViewContext";

export default function useAdminView() {
  return useContext(AdminViewContext);
}
