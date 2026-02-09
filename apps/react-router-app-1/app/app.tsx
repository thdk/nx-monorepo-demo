// Uncomment this line to use CSS modules
// import styles from './app.module.css';

import { BrowserRouter } from 'react-router';

export function App() {
  return (
    <div>
      <h1>
        <span> Hello there, </span>
        Welcome @thdk/react-router-app-1 👋
      </h1>
    </div>
  );
}

export default App;

if (import.meta.vitest) {
  // add tests related to your file here
  // For more information please visit the Vitest docs site here: https://vitest.dev/guide/in-source.html

  const { it, expect, beforeEach } = import.meta.vitest;
  let render: typeof import('@testing-library/react').render;

  beforeEach(async () => {
    render = (await import('@testing-library/react')).render;
  });

  it('should render successfully', () => {
    const { baseElement } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );
    expect(baseElement).toBeTruthy();
  });

  it('should have a greeting as the title', () => {
    const { getAllByText } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );
    expect(
      getAllByText(new RegExp('Welcome @thdk/react-router-app-1', 'gi'))
        .length > 0
    ).toBeTruthy();
  });
}
