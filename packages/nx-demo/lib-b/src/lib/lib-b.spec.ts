import { libB } from './lib-b.js';

describe('libB', () => {
  it('should work', () => {
    expect(libB()).toMatch(/^lib-b-[\w-]+$/);
  });
});
