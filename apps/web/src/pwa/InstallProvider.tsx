import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createInstallController, type InstallController } from './install';
const Context = createContext<InstallController | null>(null);
export function InstallProvider({ children, controller: supplied }: { readonly children: ReactNode; readonly controller?: InstallController }) {
  const [controller] = useState(() => supplied ?? createInstallController());
  useEffect(() => { controller.start(); return () => controller.stop(); }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useInstall() {
  const controller = useContext(Context);
  if (!controller) throw new Error('InstallProvider is required');
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...snapshot, promptInstall: controller.promptInstall };
}
