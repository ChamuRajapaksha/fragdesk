import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Calls `handler` whenever the backend finishes a factory reset. Pages use
 * this to drop any cached data still on screen after the database has been
 * emptied.
 */
export function useDataWiped(handler: () => void) {
  useEffect(() => {
    const unlisten = listen("data-wiped", () => handler());
    return () => {
      void unlisten.then((off) => off());
    };
  }, [handler]);
}
