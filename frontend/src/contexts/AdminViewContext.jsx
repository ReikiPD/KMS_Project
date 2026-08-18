import { createContext } from "react";

export const AdminViewContext = createContext({
  isActingAsEmployee: false,
  isAdminViewingUser: false,
  isLeaderViewingEmployee: false,
  isEmployeeContext: false,
  employeeId: "",
  staffMember: null,
  staffLoading: false,
  withEmployeeContext: (path) => path,
  enterEmployeeContext: (_employeeId, path) => path,
  enterAdminView: (_userId, path) => path,
  enterLeaderView: (_employeeId, path) => path,
  exitEmployeeContext: () => undefined,
});
