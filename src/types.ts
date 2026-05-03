import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface Project {
  id: string;
  name: string;
  type: 'subtitle' | 'lyric' | 'dj' | 'karaoke';
  captions: Caption[];
  style: CaptionStyle;
  mediaUrl?: string;
  createdAt?: number;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  position: 'bottom' | 'top' | 'middle';
  animation: 'none' | 'fade' | 'slide' | 'pop';
  bold: boolean;
  italic: boolean;
}

export interface StylePreset {
  id: string;
  name: string;
  style: CaptionStyle;
}

export const DEFAULT_STYLE: CaptionStyle = {
  fontFamily: 'Inter',
  fontSize: 24,
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.5)',
  position: 'bottom',
  animation: 'fade',
  bold: true,
  italic: false,
};
