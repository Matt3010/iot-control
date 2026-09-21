import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from 'lucide';

export const ICONS = {
  pin: MapPin,
  search: Search,
  submit: ArrowRight,
  filters: SlidersHorizontal,
  plus: Plus,
  close: X,
  trash: Trash2,
  edit: Pencil,
  directions: Navigation,
  undo: Undo2,
  collapse: ChevronUp,
  expand: ChevronDown,
} as const;

export type IconName = keyof typeof ICONS;
