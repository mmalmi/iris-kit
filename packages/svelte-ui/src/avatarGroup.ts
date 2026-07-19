import type { IrisProfile } from './profile';

export interface AvatarGroupItem {
  pubkey: string;
  profile?: IrisProfile | null;
  name?: string | null;
  picture?: string | null;
  href?: string | null;
  label?: string | null;
}
