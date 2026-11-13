import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { applyTheme } from './theme/useTheme';
import { loadThemeId } from './theme/themes';

// 先落主题变量再挂载：否则存了「赛博」的人刷新时会先闪一下默认的暖木底色
applyTheme(loadThemeId());

createApp(App).mount('#app');
