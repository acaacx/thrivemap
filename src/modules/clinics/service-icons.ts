import {
  Activity,
  Baby,
  Blocks,
  BookOpen,
  ClipboardList,
  Hand,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * services.icon holds a kebab-case lucide name (seeded in
 * 20260802000016_reference_data.sql). A static map, not lucide-react/dynamic:
 * the taxonomy is seven rows, and DynamicIcon ships the whole catalogue and
 * forces a client component.
 */
const SERVICE_ICONS: Record<string, LucideIcon> = {
  hand: Hand, // occupational-therapy
  "message-circle": MessageCircle, // speech-therapy
  activity: Activity, // physical-therapy
  blocks: Blocks, // behavioral-therapy
  // Legacy value, present until 20260813000022 applies. Never render a
  // puzzle piece — see the theme note in globals.css.
  puzzle: Blocks,
  baby: Baby, // early-intervention
  "clipboard-list": ClipboardList, // developmental-assessment
  "book-open": BookOpen, // special-education-support
};

export function serviceIcon(icon: string | null | undefined): LucideIcon {
  return (icon && SERVICE_ICONS[icon]) || Sparkles;
}
