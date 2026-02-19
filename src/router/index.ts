import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Home",
    component: () => import("@/pages/Home.vue"),
  },
  {
    path: "/revolution",
    name: "Revolution",
    component: () => import("@/pages/RevolutionVolume.vue"),
  },
  {
    path: "/matrix",
    name: "Matrix",
    component: () => import("@/pages/PlaceholderPage.vue"),
    meta: { titleKey: "app.nav.matrix" },
  },
  {
    path: "/graphing",
    name: "Graphing",
    component: () => import("@/pages/PlaceholderPage.vue"),
    meta: { titleKey: "app.nav.graphing" },
  },
  {
    path: "/derivatives",
    name: "Derivatives",
    component: () => import("@/pages/PlaceholderPage.vue"),
    meta: { titleKey: "app.nav.derivatives" },
  },
  {
    path: "/geometry",
    name: "Geometry",
    component: () => import("@/pages/PlaceholderPage.vue"),
    meta: { titleKey: "app.nav.geometry" },
  },
  {
    path: "/statistics",
    name: "Statistics",
    component: () => import("@/pages/PlaceholderPage.vue"),
    meta: { titleKey: "app.nav.statistics" },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },
});

export default router;
