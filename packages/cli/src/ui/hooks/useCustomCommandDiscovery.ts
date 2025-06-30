
import { useState, useEffect } from "react";
import {
  CustomCommand,
  discoverCustomCommands,
} from "../../config/customCommands.js";

export function useCustomCommandDiscovery() {
  const [commands, setCommands] = useState<CustomCommand[]>([]);

  useEffect(() => {
    discoverCustomCommands().then(setCommands);
  }, []);

  return commands;
}
