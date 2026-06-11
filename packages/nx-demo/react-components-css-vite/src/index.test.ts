import * as lib from './index';

describe('@thdk/react-components-css-vite', () => {
  it('exports the expected components from the barrel', () => {
    expect(lib.Alert).toBeDefined();
    expect(lib.Avatar).toBeDefined();
    expect(lib.Badge).toBeDefined();
    expect(lib.Button).toBeDefined();
    expect(lib.Card).toBeDefined();
  });
});
