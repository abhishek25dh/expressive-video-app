
export enum Expression {
  Talking = "Talking",
  Angry = "Angry",
  Sad = "Sad",
  FoldingHands = "FoldingHands",
  LittleShocked = "LittleShocked",
  Frustrated = "Frustrated", // Renamed from LittleFrustrated
  MoreShocked = "MoreShocked",
  MoreSad = "MoreSad",
}

export const ALL_EXPRESSIONS: Expression[] = [
  Expression.Talking,
  Expression.Angry,
  Expression.Sad,
  Expression.FoldingHands,
  Expression.LittleShocked,
  Expression.Frustrated,
  Expression.MoreShocked,
  Expression.MoreSad,
];

export const EXPRESSION_LABELS: Record<Expression, string> = {
  [Expression.Talking]: "Talking",
  [Expression.Angry]: "Angry",
  [Expression.Sad]: "Sad",
  [Expression.FoldingHands]: "Folding Hands",
  [Expression.LittleShocked]: "Little Shocked",
  [Expression.Frustrated]: "Frustrated",
  [Expression.MoreShocked]: "More Shocked",
  [Expression.MoreSad]: "More Sad",
};

export const DEFAULT_CHARACTER_IMAGE_URLS: Partial<Record<Expression, string>> = {
  [Expression.Talking]: "https://i.ibb.co/G3JJxQYc/1.png",
  [Expression.Angry]: "https://i.ibb.co/WWZ14Y2K/2.png",
  [Expression.Sad]: "https://i.ibb.co/1Sg9Gs2/3.png",
  [Expression.FoldingHands]: "https://i.ibb.co/SDpVJp1f/4.png",
  [Expression.LittleShocked]: "https://i.ibb.co/FqNmtXtH/6.png",
  [Expression.Frustrated]: "https://i.ibb.co/gZh9byC8/8.png", // New URL for Frustrated
  [Expression.MoreShocked]: "https://i.ibb.co/j9KwJNWv/9.png",
  [Expression.MoreSad]: "https://i.ibb.co/5gvHb5fJ/10.png",
};

export const STRONG_EXPRESSIONS: Expression[] = [
  Expression.Angry,
  Expression.Frustrated, // Updated from LittleFrustrated
  Expression.MoreShocked,
  Expression.MoreSad,
  Expression.LittleShocked,
];
