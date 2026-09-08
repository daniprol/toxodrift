import './style.css';
import { startApplication } from './app/application';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing app root');
}

void startApplication(root);
