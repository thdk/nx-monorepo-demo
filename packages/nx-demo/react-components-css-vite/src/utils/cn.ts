export const cn = (...args: Array<string | false | null | undefined>): string =>
  args.filter(Boolean).join(' ');
