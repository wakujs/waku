'use client';

import styles from './css-modules-client.module.css';

export default function CssModulesClient() {
  return (
    <div data-testid="css-modules-client" className={styles.wrapper}>
      Hello
    </div>
  );
}
