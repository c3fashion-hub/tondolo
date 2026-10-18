import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "link";
  size?: "md" | "sm";
  block?: boolean;
  icon?: IconName;
};

export function buttonClass({ variant = "primary", size = "md", block = false, className }: Pick<Props, "variant" | "size" | "block" | "className">) {
  return ["tn-btn", `tn-btn-${variant}`, `tn-btn-${size}`, block && "tn-btn-block", className].filter(Boolean).join(" ");
}

export function Button({ variant, size = "md", block, icon, className, type = "button", children, ...rest }: Props) {
  return (
    <button type={type} {...rest} className={buttonClass({ variant, size, block, className })}>
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}
