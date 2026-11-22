import type { ReactNode, SVGProps } from "react";

/**
 * The icon set from the design language: 24 px grid, 1.7 px round strokes,
 * drawn in currentColor so any text colour class tints them.
 */
type IconProps = { size?: number; className?: string; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

function Svg({ size = 22, className, strokeWidth = 1.7, filled, children, ...rest }: IconProps & { filled?: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" focusable="false"
      fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => <Svg {...p}><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Svg>;
export const SellIcon = (p: IconProps) => <Svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /></Svg>;
export const StockIcon = (p: IconProps) => <Svg {...p}><path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8" /></Svg>;
export const MoneyIcon = (p: IconProps) => <Svg {...p}><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M16 14h2" /></Svg>;
export const TeamIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3.3 2.5 3.5 6" /></Svg>
);
export const PersonIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c.7-4.2 3.6-6.5 7.5-6.5s6.8 2.3 7.5 6.5" /></Svg>;
export const BellIcon = (p: IconProps) => <Svg {...p}><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" /></Svg>;
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const MinusIcon = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const ArrowUpIcon = (p: IconProps) => <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const SearchIcon = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></Svg>;
export const ChevronRightIcon = (p: IconProps) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const ChevronLeftIcon = (p: IconProps) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const ChevronDownIcon = (p: IconProps) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const CloseIcon = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const SunIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" /></Svg>;
export const MoonIcon = (p: IconProps) => <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>;
export const SignOutIcon = (p: IconProps) => <Svg {...p}><path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9" /></Svg>;
/** The four-point spark — the single mark for everything the app suggests (violet = Insight). */
export const SparkIcon = (p: IconProps) => <Svg {...p} filled><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Svg>;
export const WhatsAppIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20l1.2-4.1A8 8 0 1 1 8.2 19z" /><path d="M9.2 8.8c.3 2.4 2.6 4.7 5 5l1.2-1.2-1.9-1-.9.7c-.8-.4-1.6-1.2-2-2l.7-.9-1-1.9z" /></Svg>
);

export const FilterIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>;
export const EditIcon = (p: IconProps) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></Svg>;
export const PrintIcon = (p: IconProps) => <Svg {...p}><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z" /></Svg>;
export const ReturnIcon = (p: IconProps) => <Svg {...p}><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></Svg>;
export const TruckIcon = (p: IconProps) => <Svg {...p}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01" /></Svg>;
export const ShareIcon = (p: IconProps) => <Svg {...p}><path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></Svg>;
export const TrashIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" /></Svg>;
export const EyeIcon = (p: IconProps) => <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const RestoreIcon = (p: IconProps) => <Svg {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></Svg>;

/* Added with the Sell screens (step 7). */
export const MoreIcon = (p: IconProps) => <Svg {...p} filled><circle cx="5.5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.5" cy="12" r="1.7" /></Svg>;
export const MessageIcon = (p: IconProps) => <Svg {...p}><path d="M4 5h16v11H10l-4 4v-4H4z" /></Svg>;
export const KeyIcon = (p: IconProps) => <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" /></Svg>;
export const PinIcon = (p: IconProps) => <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></Svg>;
export const ArchiveIcon = (p: IconProps) => <Svg {...p}><path d="M4 6h16v4H4zM5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9M10 14h4" /></Svg>;
export const CopyIcon = (p: IconProps) => <Svg {...p}><path d="M9 9h10v11H9zM5 15V4h10" /></Svg>;
