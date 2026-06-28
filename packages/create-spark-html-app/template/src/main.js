import { mount, store } from 'spark-html';
import { theme } from 'spark-html-theme';

// Shared stores connect components without providers or prop drilling.
store('app', { sparks: 0 });

// One-line dark/light/system theming (the ⚡ logo toggles it).
theme();

// Resolve every <div import="..."> placeholder and boot the components.
mount();
