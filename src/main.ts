import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './style.css';
import { startApplication } from './app/application';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing app root');
}

void startApplication(root);
