import { createContext } from "react";

export const AdminViewContext = createContext({
  isActingAsEmployee: false,
  isAdminViewingUser: false,
  isLeaderViewingEmployee: false,
  isScopedViewingAccount: false,
  isNestedScopedContext: false,
  isNestedLeaderContext: false,
  isEmployeeContext: false,
  employeeId: "",
  employeePublicId: "",
  staffMember: null,
  supervisorMember: null,
  staffLoading: false,
  accessUser: null,
  withEmployeeContext: (path) => path,
  enterEmployeeContext: (_employeeId, path) => path,
  enterAdminView: (_userId, path) => path,
  enterScopedView: (_userId, path) => path,
  enterLeaderView: (_employeeId, path) => path,
  exitEmployeeContext: () => undefined,
});
