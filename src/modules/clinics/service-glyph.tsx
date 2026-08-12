import { createElement } from "react";
import { serviceIcon } from "./service-icons";

/**
 * Renders the lucide icon for a services.icon value. createElement rather
 * than `const Icon = serviceIcon(...)` + JSX: the icon components are
 * module-level constants with stable identity, but react-hooks/
 * static-components can't see that and flags the JSX form as a component
 * created during render.
 */
export function ServiceGlyph({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  return createElement(serviceIcon(icon), {
    className,
    "aria-hidden": true,
  });
}
