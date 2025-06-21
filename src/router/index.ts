import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/vibe',
    },
    {
      path: '/vibe',
      name: 'VibeExplorer',
      component: () => import('@/components/VibeExplorer.vue'),
    },
    {
        path: '/codepen',
        name: 'CodePen',
        component: () => import('@/views/CodePen.vue'),
        redirect: '/codepen/squiggles',
        children: [
            {
                path: 'squiggles',
                name: 'Squiggles',
                component: () => import('@/codepens/Squiggles.vue'),
            },
            {
                path: 'RandomUnderline',
                name: 'RandomUnderline',
                component: () => import('@/codepens/RandomUnderline.vue'),
            },
        ],
    },
  ],
});

export default router;
