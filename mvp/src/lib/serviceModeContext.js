import { serviceModes } from "../data/setupCatalog";

export const workplaceServiceMode = serviceModes.find((mode) => mode.id === "workplace") || serviceModes[0];

export function resolveServiceMode(id) {
  return serviceModes.find((mode) => mode.id === id) || workplaceServiceMode;
}
