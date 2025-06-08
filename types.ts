import { Expression } from './constants';

export type CharacterImages = Record<Expression, string | null>; // string is Object URL

export interface ContextualImageItem {
  pixabayUrl: string | null;
  userOverriddenUrl: string | null;
  displayUrl: string | null; // This will be what's actually shown
}
